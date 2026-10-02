/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type {
  Asset,
  AssetKind,
  AssetStatus,
  OrganizationRole,
} from '@prisma/client';
import { AssetsService } from '../src/assets/assets.service';
import { CreateAssetUploadDto } from '../src/assets/dto/create-asset-upload.dto';
import { OrganizationAccessService } from '../src/organizations/organization-access.service';

const organizationId = '11111111-1111-4111-8111-111111111111';
const otherOrganizationId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';

const now = new Date('2026-10-01T00:00:00.000Z');

function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: assetId,
    organizationId,
    createdByUserId: userId,
    kind: 'IMAGE',
    status: 'PENDING_UPLOAD',
    storageProvider: 'R2',
    bucket: 'test-bucket',
    objectKey: `organizations/${organizationId}/assets/${assetId}/source.jpg`,
    originalFileName: 'dress.jpg',
    mimeType: 'image/jpeg',
    fileSize: 5,
    width: null,
    height: null,
    durationSeconds: null,
    checksumSha256: null,
    createdAt: now,
    updatedAt: now,
    readyAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function createHarness(
  options: {
    role?: OrganizationRole;
    assets?: Asset[];
    inputReferences?: string[];
    outputReferences?: string[];
  } = {},
) {
  const assets = (options.assets ?? []).map((asset) => ({ ...asset }));
  const storage = {
    createPresignedUpload: jest
      .fn()
      .mockResolvedValue({ uploadUrl: 'https://storage.example/upload' }),
    headObject: jest
      .fn()
      .mockResolvedValue({
        exists: true,
        contentLength: 5,
        contentType: 'image/jpeg',
      }),
    createPresignedDownload: jest
      .fn()
      .mockResolvedValue({ downloadUrl: 'https://storage.example/download' }),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    putObject: jest.fn().mockResolvedValue(undefined),
  };
  const organizationMember = {
    findUnique: jest.fn(
      ({
        where,
      }: {
        where: {
          userId_organizationId: { userId: string; organizationId: string };
        };
      }) => {
        const key = where.userId_organizationId;
        if (key.userId !== userId || key.organizationId !== organizationId)
          return null;
        return {
          id: 'membership-id',
          userId,
          organizationId,
          role: options.role ?? 'OWNER',
        };
      },
    ),
  };
  const assetDelegate = {
    create: jest.fn(
      ({
        data,
      }: {
        data: Omit<
          Asset,
          | 'createdAt'
          | 'updatedAt'
          | 'readyAt'
          | 'deletedAt'
          | 'width'
          | 'height'
          | 'durationSeconds'
          | 'checksumSha256'
        >;
      }) => {
        const asset = createAsset({ ...data, id: data.id });
        assets.push(asset);
        return asset;
      },
    ),
    findFirst: jest.fn(
      ({ where, select }: { where: { id: string; organizationId: string }; select?: unknown }) => {
        const found = assets.find(
          (asset) =>
            asset.id === where.id &&
            asset.organizationId === where.organizationId,
        ) ?? null;
        if (!found || !select) return found;
        return {
          _count: {
            generationInputs: options.inputReferences?.includes(found.id) ? 1 : 0,
            generationOutputs: options.outputReferences?.includes(found.id) ? 1 : 0,
          },
        };
      },
    ),
    findMany: jest.fn(
      (args: {
        where: {
          organizationId: string;
          deletedAt: null;
          kind?: AssetKind;
          status?: AssetStatus;
        };
        cursor?: { id: string };
        skip?: number;
        take: number;
      }) => {
        let result = assets.filter(
          (asset) =>
            asset.organizationId === args.where.organizationId &&
            asset.deletedAt === null &&
            (!args.where.kind || asset.kind === args.where.kind) &&
            (!args.where.status || asset.status === args.where.status),
        );
        const cursorIndex = args.cursor
          ? result.findIndex((asset) => asset.id === args.cursor?.id)
          : -1;
        if (cursorIndex >= 0)
          result = result.slice(cursorIndex + (args.skip ?? 0));
        return result.slice(0, args.take).map((asset) => ({
          ...asset,
          generationInputs: options.inputReferences?.includes(asset.id) ? [{ role: 'PERSON' }] : [],
          generationOutputs: options.outputReferences?.includes(asset.id) ? [{ generationId: 'generation-id' }] : [],
        }));
      },
    ),
    updateMany: jest.fn(
      (args: {
        where: {
          id: string;
          organizationId: string;
          status: AssetStatus | { in: AssetStatus[] };
        };
        data: Partial<Asset>;
      }) => {
        const target = assets.find(
          (asset) =>
            asset.id === args.where.id &&
            asset.organizationId === args.where.organizationId,
        );
        const statuses =
          typeof args.where.status === 'string'
            ? [args.where.status]
            : args.where.status.in;
        if (!target || !statuses.includes(target.status)) return { count: 0 };
        Object.assign(target, args.data, { updatedAt: new Date() });
        return { count: 1 };
      },
    ),
  };
  const prisma = { organizationMember, asset: assetDelegate };
  const configValues: Record<string, unknown> = {
    'storage.bucket': 'test-bucket',
    'storage.uploadExpiresInSeconds': 900,
    'storage.downloadExpiresInSeconds': 600,
    'storage.maxImageBytes': 20,
    'storage.maxVideoBytes': 200,
    'storage.maxPdfBytes': 25,
  };
  const config = {
    get: jest.fn((key: string) => configValues[key]),
    getOrThrow: jest.fn((key: string) => configValues[key]),
  };
  const access = new OrganizationAccessService(prisma as never);
  const service = new AssetsService(
    prisma as never,
    access,
    config as never,
    storage,
  );
  return { service, storage, assetDelegate, assets: () => assets };
}

function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  return expect(promise).rejects.toMatchObject({
    response: expect.objectContaining({ code }),
  });
}

describe('AssetsService upload init', () => {
  it.each([
    ['image/jpeg', 'IMAGE', 'jpg'],
    ['video/mp4', 'VIDEO', 'mp4'],
    ['application/pdf', 'DOCUMENT', 'pdf'],
  ] as const)(
    'initializes supported %s upload',
    async (mimeType, kind, extension) => {
      const { service, storage, assets } = createHarness();
      const result = await service.createUpload(userId, organizationId, {
        fileName: '../customer-name',
        mimeType,
        fileSize: 5,
      });
      expect(result.asset.kind).toBe(kind);
      expect(result.asset.status).toBe('PENDING_UPLOAD');
      expect(assets()[0]?.objectKey).toMatch(
        new RegExp(
          `^organizations/${organizationId}/assets/.+/source\\.${extension}$`,
        ),
      );
      expect(assets()[0]?.objectKey).not.toContain('customer-name');
      expect(storage.createPresignedUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'test-bucket',
          contentType: mimeType,
          contentLength: 5,
        }),
      );
    },
  );

  it('returns 404 for an outsider', async () => {
    const { service } = createHarness();
    await expectCode(
      service.createUpload('outsider', organizationId, {
        fileName: 'dress.jpg',
        mimeType: 'image/jpeg',
        fileSize: 5,
      }),
      'ORGANIZATION_NOT_FOUND',
    );
  });

  it.each([
    ['image/jpeg', 21],
    ['video/mp4', 201],
    ['application/pdf', 26],
  ] as const)('rejects oversized %s uploads', async (mimeType, fileSize) => {
    const { service } = createHarness();
    await expectCode(
      service.createUpload(userId, organizationId, {
        fileName: 'file',
        mimeType,
        fileSize,
      }),
      'ASSET_FILE_TOO_LARGE',
    );
  });

  it('rejects unsupported MIME type in the service', async () => {
    const { service } = createHarness();
    await expectCode(
      service.createUpload(userId, organizationId, {
        fileName: 'file.exe',
        mimeType: 'application/octet-stream' as 'image/jpeg',
        fileSize: 5,
      }),
      'ASSET_INVALID_FILE_TYPE',
    );
  });

  it('strict DTO validation rejects non-positive sizes and frontend object keys or buckets', async () => {
    for (const fileSize of [0, -1]) {
      const errors = await validate(
        plainToInstance(CreateAssetUploadDto, {
          fileName: 'dress.jpg',
          mimeType: 'image/jpeg',
          fileSize,
        }),
      );
      expect(errors).not.toHaveLength(0);
    }
    const errors = await validate(
      plainToInstance(CreateAssetUploadDto, {
        fileName: 'dress.jpg',
        mimeType: 'image/jpeg',
        fileSize: 5,
        objectKey: 'attacker/key',
        bucket: 'attacker-bucket',
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['objectKey', 'bucket']),
    );
  });
});

describe('AssetsService completion and failure', () => {
  it('marks a pending asset READY only after HEAD metadata verification', async () => {
    const pending = createAsset();
    const { service, storage, assets } = createHarness({ assets: [pending] });
    const result = await service.completeUpload(
      userId,
      organizationId,
      assetId,
    );
    expect(storage.headObject).toHaveBeenCalledWith(
      pending.bucket,
      pending.objectKey,
    );
    expect(result.asset.status).toBe('READY');
    expect(result.asset.readyAt).not.toBeNull();
    expect(assets()[0]?.status).toBe('READY');
  });

  it('does not complete when the object is missing', async () => {
    const { service, storage, assets } = createHarness({
      assets: [createAsset()],
    });
    storage.headObject.mockResolvedValueOnce({ exists: false });
    await expectCode(
      service.completeUpload(userId, organizationId, assetId),
      'ASSET_UPLOAD_NOT_FOUND',
    );
    expect(assets()[0]?.status).toBe('PENDING_UPLOAD');
  });

  it('rejects size mismatch without changing status', async () => {
    const { service, storage, assets } = createHarness({
      assets: [createAsset()],
    });
    storage.headObject.mockResolvedValueOnce({
      exists: true,
      contentLength: 99,
      contentType: 'image/jpeg',
    });
    await expectCode(
      service.completeUpload(userId, organizationId, assetId),
      'ASSET_UPLOAD_SIZE_MISMATCH',
    );
    expect(assets()[0]?.status).toBe('PENDING_UPLOAD');
  });

  it.each(['READY', 'FAILED', 'DELETED'] as const)(
    'does not complete %s asset',
    async (status) => {
      const { service, storage } = createHarness({
        assets: [createAsset({ status })],
      });
      await expectCode(
        service.completeUpload(userId, organizationId, assetId),
        'ASSET_INVALID_STATUS',
      );
      expect(storage.headObject).not.toHaveBeenCalled();
    },
  );

  it('cannot complete another organization asset', async () => {
    const { service } = createHarness({
      assets: [createAsset({ organizationId: otherOrganizationId })],
    });
    await expectCode(
      service.completeUpload(userId, organizationId, assetId),
      'ASSET_NOT_FOUND',
    );
  });

  it('marks a pending upload FAILED but rejects READY and outsider failure', async () => {
    const first = createHarness({ assets: [createAsset()] });
    await expect(
      first.service.failUpload(userId, organizationId, assetId),
    ).resolves.toEqual(expect.objectContaining({ status: 'FAILED' }));
    const second = createHarness({
      assets: [createAsset({ status: 'READY' })],
    });
    await expectCode(
      second.service.failUpload(userId, organizationId, assetId),
      'ASSET_INVALID_STATUS',
    );
    await expectCode(
      second.service.failUpload('outsider', organizationId, assetId),
      'ORGANIZATION_NOT_FOUND',
    );
  });
});

describe('AssetsService get, list, and access URLs', () => {
  it('returns metadata to members, hides assets from outsiders, and exposes no bucket/key', async () => {
    const { service } = createHarness({
      role: 'MEMBER',
      assets: [createAsset()],
    });
    const result = await service.get(userId, organizationId, assetId);
    expect(result.originalFileName).toBe('dress.jpg');
    expect(result).not.toHaveProperty('bucket');
    expect(result).not.toHaveProperty('objectKey');
    await expectCode(
      service.get('outsider', organizationId, assetId),
      'ORGANIZATION_NOT_FOUND',
    );
  });

  it('lists only same-organization non-deleted assets with kind and status filters', async () => {
    const assets = [
      createAsset({ id: 'one', status: 'READY' }),
      createAsset({ id: 'two', kind: 'VIDEO', mimeType: 'video/mp4' }),
      createAsset({ id: 'three', status: 'DELETED', deletedAt: now }),
      createAsset({ id: 'four', organizationId: otherOrganizationId }),
    ];
    const { service } = createHarness({ assets });
    const result = await service.list(userId, organizationId, {
      limit: 20,
      kind: 'IMAGE',
      status: 'READY',
    });
    expect(result.items.map((asset) => asset.id)).toEqual(['one']);
  });

  it('paginates with a next cursor', async () => {
    const { service } = createHarness({
      assets: [createAsset({ id: 'one' }), createAsset({ id: 'two' })],
    });
    const first = await service.list(userId, organizationId, { limit: 1 });
    expect(first.items).toHaveLength(1);
    expect(first.pageInfo.hasNextPage).toBe(true);
    expect(first.pageInfo.nextCursor).toBe('one');
    const second = await service.list(userId, organizationId, {
      limit: 1,
      cursor: first.pageInfo.nextCursor ?? undefined,
    });
    expect(second.items[0]?.id).toBe('two');
  });

  it('creates a short-lived URL only for READY assets', async () => {
    const ready = createAsset({ status: 'READY', readyAt: now });
    const { service, storage } = createHarness({ assets: [ready] });
    await expect(
      service.createAccessUrl(userId, organizationId, assetId),
    ).resolves.toEqual({
      url: 'https://storage.example/download',
      expiresIn: 600,
    });
    expect(storage.createPresignedDownload).toHaveBeenCalledWith(
      ready.bucket,
      ready.objectKey,
      600,
    );
  });

  it.each(['PENDING_UPLOAD', 'FAILED', 'DELETED'] as const)(
    'rejects access URL for %s',
    async (status) => {
      const { service } = createHarness({ assets: [createAsset({ status })] });
      await expectCode(
        service.createAccessUrl(userId, organizationId, assetId),
        'ASSET_NOT_READY',
      );
    },
  );

  it('returns 404 for outsider access URL requests', async () => {
    const { service } = createHarness({
      assets: [createAsset({ status: 'READY' })],
    });
    await expectCode(
      service.createAccessUrl('outsider', organizationId, assetId),
      'ORGANIZATION_NOT_FOUND',
    );
  });
});

describe('AssetsService deletion', () => {
  it.each(['OWNER', 'ADMIN'] as const)(
    '%s deletes storage and soft-deletes metadata',
    async (role) => {
      const asset = createAsset({ status: 'READY', readyAt: now });
      const { service, storage, assets } = createHarness({
        role,
        assets: [asset],
      });
      const result = await service.delete(userId, organizationId, assetId);
      expect(storage.deleteObject).toHaveBeenCalledWith(
        asset.bucket,
        asset.objectKey,
      );
      expect(result.status).toBe('DELETED');
      expect(result.deletedAt).not.toBeNull();
      expect(assets()[0]?.status).toBe('DELETED');
    },
  );

  it('forbids MEMBER deletion', async () => {
    const { service, storage } = createHarness({
      role: 'MEMBER',
      assets: [createAsset({ status: 'READY' })],
    });
    await expectCode(
      service.delete(userId, organizationId, assetId),
      'ASSET_ACCESS_DENIED',
    );
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('handles repeated deletion idempotently without deleting storage twice', async () => {
    const deleted = createAsset({ status: 'DELETED', deletedAt: now });
    const { service, storage } = createHarness({ assets: [deleted] });
    await expect(
      service.delete(userId, organizationId, assetId),
    ).resolves.toEqual(expect.objectContaining({ status: 'DELETED' }));
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it.each(['input', 'output'] as const)('protects an asset referenced as generation %s', async (relation) => {
    const { service, storage } = createHarness({
      assets: [createAsset({ status: 'READY' })],
      ...(relation === 'input' ? { inputReferences: [assetId] } : { outputReferences: [assetId] }),
    });
    await expectCode(service.delete(userId, organizationId, assetId), 'ASSET_REFERENCED');
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('derives generated source and input roles without exposing storage metadata', async () => {
    const { service } = createHarness({ assets: [createAsset({ status: 'READY' })], inputReferences: [assetId], outputReferences: [assetId] });
    const result = await service.list(userId, organizationId, { limit: 20, status: 'READY', source: 'GENERATED' });
    expect(result.items[0]).toEqual(expect.objectContaining({ source: 'GENERATED', generationId: 'generation-id', inputRoles: ['PERSON'] }));
    expect(result.items[0]).not.toHaveProperty('objectKey');
  });
});
