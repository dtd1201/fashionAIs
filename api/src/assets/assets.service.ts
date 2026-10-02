import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Asset, AssetKind, AssetStatus } from '@prisma/client';
import type {
  AssetAccessUrlResponse,
  AssetListResponse,
  AssetView,
  CompleteAssetResponse,
  CreateAssetUploadResponse,
} from '@fashion-ais/types';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../storage/storage-provider.interface';
import type { CreateAssetUploadDto } from './dto/create-asset-upload.dto';
import type { ListAssetsDto } from './dto/list-assets.dto';

interface AssetLogContext {
  requestId?: string;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async createUpload(
    userId: string,
    organizationId: string,
    dto: CreateAssetUploadDto,
    context: AssetLogContext = {},
  ): Promise<CreateAssetUploadResponse> {
    await this.access.requireMembership(userId, organizationId);
    const kind = this.kindForMimeType(dto.mimeType);
    this.validateSize(kind, dto.fileSize);

    const assetId = randomUUID();
    const bucket = this.storageBucket();
    const objectKey = this.createObjectKey(
      organizationId,
      assetId,
      dto.mimeType,
    );
    const asset = await this.prisma.asset.create({
      data: {
        id: assetId,
        organizationId,
        createdByUserId: userId,
        kind,
        status: 'PENDING_UPLOAD',
        storageProvider: 'R2',
        bucket,
        objectKey,
        originalFileName: dto.fileName,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
      },
    });
    const expiresIn = this.config.getOrThrow<number>(
      'storage.uploadExpiresInSeconds',
    );
    const { uploadUrl } = await this.storageOperation(() =>
      this.storage.createPresignedUpload({
        bucket,
        objectKey,
        contentType: dto.mimeType,
        contentLength: dto.fileSize,
        expiresInSeconds: expiresIn,
      }),
    );

    this.log(context, asset, 'upload-init', 'PENDING_UPLOAD');
    return {
      asset: this.toView(asset),
      upload: {
        method: 'PUT',
        url: uploadUrl,
        headers: { 'Content-Type': dto.mimeType },
        expiresIn,
      },
    };
  }

  async completeUpload(
    userId: string,
    organizationId: string,
    assetId: string,
    context: AssetLogContext = {},
  ): Promise<CompleteAssetResponse> {
    await this.access.requireMembership(userId, organizationId);
    const asset = await this.requireAsset(organizationId, assetId);
    this.requireStatus(asset, 'PENDING_UPLOAD');

    const metadata = await this.storageOperation(() =>
      this.storage.headObject(asset.bucket, asset.objectKey),
    );
    if (!metadata.exists) {
      throw new ConflictException({
        code: 'ASSET_UPLOAD_NOT_FOUND',
        message: 'Uploaded object was not found',
      });
    }
    if (
      metadata.contentLength !== undefined &&
      metadata.contentLength !== asset.fileSize
    ) {
      throw new ConflictException({
        code: 'ASSET_UPLOAD_SIZE_MISMATCH',
        message: 'Uploaded object size does not match the expected size',
      });
    }
    if (
      metadata.contentType !== undefined &&
      this.normalizeContentType(metadata.contentType) !== asset.mimeType
    ) {
      throw new ConflictException({
        code: 'ASSET_INVALID_FILE_TYPE',
        message: 'Uploaded object content type does not match',
      });
    }

    const readyAt = new Date();
    const updated = await this.prisma.asset.updateMany({
      where: { id: asset.id, organizationId, status: 'PENDING_UPLOAD' },
      data: { status: 'READY', readyAt },
    });
    if (updated.count !== 1) throw this.invalidStatus();
    const ready = await this.requireAsset(organizationId, assetId);
    this.log(context, ready, 'upload-complete', 'READY');
    return { asset: this.toView(ready) };
  }

  async failUpload(
    userId: string,
    organizationId: string,
    assetId: string,
    context: AssetLogContext = {},
  ): Promise<AssetView> {
    await this.access.requireMembership(userId, organizationId);
    const asset = await this.requireAsset(organizationId, assetId);
    this.requireStatus(asset, 'PENDING_UPLOAD');
    const updated = await this.prisma.asset.updateMany({
      where: { id: asset.id, organizationId, status: 'PENDING_UPLOAD' },
      data: { status: 'FAILED' },
    });
    if (updated.count !== 1) throw this.invalidStatus();
    const failed = await this.requireAsset(organizationId, assetId);
    this.log(context, failed, 'upload-fail', 'FAILED');
    return this.toView(failed);
  }

  async get(
    userId: string,
    organizationId: string,
    assetId: string,
  ): Promise<AssetView> {
    await this.access.requireMembership(userId, organizationId);
    return this.toView(await this.requireAsset(organizationId, assetId));
  }

  async list(
    userId: string,
    organizationId: string,
    query: ListAssetsDto,
  ): Promise<AssetListResponse> {
    await this.access.requireMembership(userId, organizationId);
    const assets = await this.prisma.asset.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.source === 'GENERATED'
          ? { generationOutputs: { some: {} } }
          : query.source === 'UPLOADED'
            ? { generationOutputs: { none: {} } }
            : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      take: query.limit + 1,
      include: {
        generationOutputs: { select: { generationId: true }, take: 1 },
        generationInputs: { select: { role: true } },
      },
    });
    const hasNextPage = assets.length > query.limit;
    const items = hasNextPage ? assets.slice(0, query.limit) : assets;
    return {
      items: items.map((asset) => ({
        ...this.toView(asset),
        source: asset.generationOutputs.length ? 'GENERATED' : 'UPLOADED',
        generationId: asset.generationOutputs[0]?.generationId ?? null,
        inputRoles: [...new Set(asset.generationInputs.map((input) => input.role))],
      })),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage ? (items.at(-1)?.id ?? null) : null,
      },
    };
  }

  async createAccessUrl(
    userId: string,
    organizationId: string,
    assetId: string,
    context: AssetLogContext = {},
  ): Promise<AssetAccessUrlResponse> {
    await this.access.requireMembership(userId, organizationId);
    const asset = await this.requireAsset(organizationId, assetId);
    if (asset.status !== 'READY') {
      throw new ConflictException({
        code: 'ASSET_NOT_READY',
        message: 'Asset is not ready for access',
      });
    }
    const expiresIn = this.config.getOrThrow<number>(
      'storage.downloadExpiresInSeconds',
    );
    const { downloadUrl } = await this.storageOperation(() =>
      this.storage.createPresignedDownload(
        asset.bucket,
        asset.objectKey,
        expiresIn,
      ),
    );
    this.log(context, asset, 'access-url', asset.status);
    return { url: downloadUrl, expiresIn };
  }

  async delete(
    userId: string,
    organizationId: string,
    assetId: string,
    context: AssetLogContext = {},
  ): Promise<AssetView> {
    const membership = await this.access.requireMembership(
      userId,
      organizationId,
    );
    if (membership.role === 'MEMBER') {
      throw new ForbiddenException({
        code: 'ASSET_ACCESS_DENIED',
        message: 'Asset deletion requires organization owner or admin access',
      });
    }
    const asset = await this.requireAsset(organizationId, assetId);
    if (asset.status === 'DELETED') return this.toView(asset);
    if (asset.status === 'PENDING_UPLOAD') throw this.invalidStatus();

    const references = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
      select: {
        _count: { select: { generationInputs: true, generationOutputs: true } },
      },
    });
    if (
      references &&
      (references._count.generationInputs > 0 ||
        references._count.generationOutputs > 0)
    ) {
      throw new ConflictException({
        code: 'ASSET_REFERENCED',
        message: 'This asset is used by generation history and cannot be deleted.',
      });
    }

    await this.storageOperation(() =>
      this.storage.deleteObject(asset.bucket, asset.objectKey),
    );
    const deletedAt = new Date();
    const updated = await this.prisma.asset.updateMany({
      where: {
        id: asset.id,
        organizationId,
        status: { in: ['READY', 'FAILED'] },
      },
      data: { status: 'DELETED', deletedAt },
    });
    if (updated.count !== 1) throw this.invalidStatus();
    const deleted = await this.requireAsset(organizationId, assetId);
    this.log(context, deleted, 'delete', 'DELETED');
    return this.toView(deleted);
  }

  private async requireAsset(
    organizationId: string,
    assetId: string,
  ): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, organizationId },
    });
    if (!asset) {
      throw new NotFoundException({
        code: 'ASSET_NOT_FOUND',
        message: 'Asset not found',
      });
    }
    return asset;
  }

  private requireStatus(asset: Asset, expected: AssetStatus): void {
    if (asset.status !== expected) throw this.invalidStatus();
  }

  private kindForMimeType(mimeType: string): AssetKind {
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType === 'application/pdf') return 'DOCUMENT';
    throw new BadRequestException({
      code: 'ASSET_INVALID_FILE_TYPE',
      message: 'Unsupported asset MIME type',
    });
  }

  private validateSize(kind: AssetKind, fileSize: number): void {
    const configKey = {
      IMAGE: 'storage.maxImageBytes',
      VIDEO: 'storage.maxVideoBytes',
      DOCUMENT: 'storage.maxPdfBytes',
      OTHER: 'storage.maxPdfBytes',
    }[kind];
    if (fileSize > this.config.getOrThrow<number>(configKey)) {
      throw new BadRequestException({
        code: 'ASSET_FILE_TOO_LARGE',
        message: 'Asset exceeds the configured size limit',
      });
    }
  }

  private createObjectKey(
    organizationId: string,
    assetId: string,
    mimeType: string,
  ): string {
    const extension: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'application/pdf': 'pdf',
    };
    return `organizations/${organizationId}/assets/${assetId}/source.${extension[mimeType]}`;
  }

  private normalizeContentType(value: string): string {
    return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  }

  private async storageOperation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException({
        code: 'ASSET_STORAGE_ERROR',
        message: 'Object storage operation failed',
      });
    }
  }

  private storageBucket(): string {
    const bucket = this.config.get<string>('storage.bucket');
    if (!bucket) {
      throw new InternalServerErrorException({
        code: 'ASSET_STORAGE_ERROR',
        message: 'Object storage is not configured',
      });
    }
    return bucket;
  }

  private invalidStatus(): ConflictException {
    return new ConflictException({
      code: 'ASSET_INVALID_STATUS',
      message: 'Asset status does not allow this operation',
    });
  }

  private toView(asset: Asset): AssetView {
    return {
      id: asset.id,
      organizationId: asset.organizationId,
      kind: asset.kind,
      status: asset.status,
      originalFileName: asset.originalFileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      width: asset.width,
      height: asset.height,
      durationSeconds: asset.durationSeconds,
      checksumSha256: asset.checksumSha256,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
      readyAt: asset.readyAt?.toISOString() ?? null,
      deletedAt: asset.deletedAt?.toISOString() ?? null,
    };
  }

  private log(
    context: AssetLogContext,
    asset: Asset,
    operation: string,
    status: AssetStatus,
  ): void {
    this.logger.log({
      requestId: context.requestId,
      assetId: asset.id,
      organizationId: asset.organizationId,
      operation,
      status,
    });
  }
}
