import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Asset } from '@prisma/client';
import type { CreateGenerationRequest, GenerationAssetRole } from '@fashion-ais/types';
import { PrismaService } from '../database/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider.interface';
import { OrganizationAccessService } from '../organizations/organization-access.service';
import type { CreateGenerationDto } from './dto/create-generation.dto';

@Injectable()
export class GenerationRequestValidator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: OrganizationAccessService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async validate(userId: string, organizationId: string, dto: CreateGenerationDto): Promise<CreateGenerationRequest> {
    await this.access.requireMembership(userId, organizationId);
    const request = this.validateContract(dto);
    const assetIds = [...new Set(request.inputs.map((input) => input.assetId))];
    const assets = await this.prisma.asset.findMany({ where: { id: { in: assetIds }, organizationId } });
    if (assets.length !== assetIds.length) throw this.invalid('One or more input assets are invalid');
    if (assets.some((asset) => asset.status !== 'READY')) {
      throw new ConflictException({ code: 'GENERATION_INPUT_ASSET_NOT_READY', message: 'All generation input assets must be ready' });
    }
    if (request.type === 'VIRTUAL_TRY_ON' && assets.some((asset) => asset.kind !== 'IMAGE' || !['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType))) {
      throw this.invalidForTryOn('VIRTUAL_TRY_ON_INVALID_INPUTS', 'Virtual try-on inputs must be supported images');
    }
    await Promise.all(assets.map((asset) => this.verifyStoredObject(asset)));
    return request;
  }

  private validateContract(dto: CreateGenerationDto): CreateGenerationRequest {
    const parameters = this.plainObject(dto.parameters ?? {});
    if (Buffer.byteLength(JSON.stringify(parameters), 'utf8') > 32 * 1024) throw this.invalid('Generation parameters are too large');
    const roles = dto.inputs.map((input) => input.role);
    if (dto.type === 'IMAGE_GENERATION') {
      this.onlyRoles(roles, ['REFERENCE', 'SOURCE']);
      if (dto.inputs.length > 4) throw this.invalid('Image generation supports at most four reference inputs');
      const prompt = this.requiredString(parameters, 'prompt', 2000);
      this.onlyKeys(parameters, ['prompt', 'negativePrompt', 'aspectRatio', 'outputCount']);
      const negativePrompt = this.optionalString(parameters, 'negativePrompt', 2000);
      const aspectRatio = this.optionalEnum(parameters, 'aspectRatio', ['1:1', '4:5', '3:4', '16:9'] as const);
      const outputCount = this.optionalInteger(parameters, 'outputCount', 1, 4);
      return { type: dto.type, inputs: dto.inputs as Array<{ assetId: string; role: 'REFERENCE' | 'SOURCE' }>, parameters: { prompt, ...(negativePrompt ? { negativePrompt } : {}), ...(aspectRatio ? { aspectRatio } : {}), ...(outputCount ? { outputCount } : {}) } };
    }
    if (dto.type === 'VIRTUAL_TRY_ON') {
      const personCount = roles.filter((role) => role === 'PERSON').length;
      const garmentCount = roles.filter((role) => role === 'GARMENT').length;
      if (personCount === 0) throw this.invalidForTryOn('VIRTUAL_TRY_ON_PERSON_REQUIRED', 'Virtual try-on requires one PERSON input');
      if (garmentCount === 0) throw this.invalidForTryOn('VIRTUAL_TRY_ON_GARMENT_REQUIRED', 'Virtual try-on requires one GARMENT input');
      if (personCount !== 1 || garmentCount !== 1 || roles.length !== 2) throw this.invalidForTryOn('VIRTUAL_TRY_ON_INVALID_INPUTS', 'Virtual try-on requires exactly one PERSON and one GARMENT');
      this.onlyKeys(parameters, ['prompt', 'resolution', 'generation_mode', 'num_images']);
      const prompt = this.optionalString(parameters, 'prompt', 500);
      const resolution = this.optionalEnum(parameters, 'resolution', ['1k', '2k', '4k'] as const);
      const generation_mode = this.optionalEnum(parameters, 'generation_mode', ['fast', 'balanced', 'quality'] as const);
      const num_images = this.optionalInteger(parameters, 'num_images', 1, 4);
      return { type: dto.type, inputs: dto.inputs as Array<{ assetId: string; role: 'PERSON' | 'GARMENT' }>, parameters: { ...(prompt ? { prompt } : {}), ...(resolution ? { resolution } : {}), ...(generation_mode ? { generation_mode } : {}), ...(num_images ? { num_images } : {}) } };
    }
    if (dto.type === 'IMAGE_EDITING') {
      if (roles.filter((role) => role === 'SOURCE').length !== 1 || roles.filter((role) => role === 'MASK').length > 1 || roles.some((role) => role !== 'SOURCE' && role !== 'MASK')) throw this.invalid('Image editing requires one SOURCE and at most one MASK');
      this.onlyKeys(parameters, ['instruction', 'strength']);
      const instruction = this.requiredString(parameters, 'instruction', 2000);
      const strength = this.optionalNumber(parameters, 'strength', 0, 1);
      return { type: dto.type, inputs: dto.inputs as Array<{ assetId: string; role: 'SOURCE' | 'MASK' }>, parameters: { instruction, ...(strength !== undefined ? { strength } : {}) } };
    }
    throw this.invalid('Generation type is not supported');
  }

  private async verifyStoredObject(asset: Asset): Promise<void> {
    try {
      const stored = await this.storage.headObject(asset.bucket, asset.objectKey);
      if (!stored.exists || (stored.contentLength !== undefined && stored.contentLength !== asset.fileSize)) throw this.invalid('Input asset storage object is unavailable');
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw this.invalid('Input asset storage object is unavailable');
    }
  }

  private plainObject(value: Record<string, unknown>): Record<string, unknown> {
    const serialized = JSON.stringify(value);
    if (/"(?:__proto__|prototype|constructor)"\s*:/.test(serialized)) throw this.invalid('Generation parameters contain forbidden keys');
    return JSON.parse(serialized) as Record<string, unknown>;
  }
  private onlyRoles(actual: GenerationAssetRole[], allowed: GenerationAssetRole[]): void { if (actual.some((role) => !allowed.includes(role))) throw this.invalid('Input role is not supported for this generation type'); }
  private exactRoles(actual: GenerationAssetRole[], expected: GenerationAssetRole[]): void { if (actual.length !== expected.length || expected.some((role) => actual.filter((item) => item === role).length !== 1)) throw this.invalid('Virtual try-on requires exactly one PERSON and one GARMENT'); }
  private onlyKeys(value: Record<string, unknown>, allowed: string[]): void { if (Object.keys(value).some((key) => !allowed.includes(key))) throw this.invalid('Generation parameters contain unsupported fields'); }
  private requiredString(value: Record<string, unknown>, key: string, max: number): string { const item = value[key]; if (typeof item !== 'string' || !item.trim() || item.length > max) throw this.invalid(`Invalid ${key}`); return item.trim(); }
  private optionalString(value: Record<string, unknown>, key: string, max: number): string | undefined { if (value[key] === undefined) return undefined; return this.requiredString(value, key, max); }
  private optionalBoolean(value: Record<string, unknown>, key: string): boolean | undefined { const item = value[key]; if (item === undefined) return undefined; if (typeof item !== 'boolean') throw this.invalid(`Invalid ${key}`); return item; }
  private optionalNumber(value: Record<string, unknown>, key: string, min: number, max: number): number | undefined { const item = value[key]; if (item === undefined) return undefined; if (typeof item !== 'number' || !Number.isFinite(item) || item < min || item > max) throw this.invalid(`Invalid ${key}`); return item; }
  private optionalInteger(value: Record<string, unknown>, key: string, min: number, max: number): number | undefined { const item = this.optionalNumber(value, key, min, max); if (item !== undefined && !Number.isInteger(item)) throw this.invalid(`Invalid ${key}`); return item; }
  private optionalEnum<T extends string>(value: Record<string, unknown>, key: string, allowed: readonly T[]): T | undefined { const item = value[key]; if (item === undefined) return undefined; if (typeof item !== 'string' || !allowed.includes(item as T)) throw this.invalid(`Invalid ${key}`); return item as T; }
  private invalid(message: string): BadRequestException { return new BadRequestException({ code: 'GENERATION_INVALID_INPUT', message }); }
  private invalidForTryOn(code: string, message: string): BadRequestException { return new BadRequestException({ code, message }); }
}
