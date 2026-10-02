import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import type { GenerationAssetRole, GenerationType } from '@fashion-ais/types';

const GENERATION_TYPES: GenerationType[] = [
  'VIRTUAL_TRY_ON',
  'IMAGE_GENERATION',
  'IMAGE_EDITING',
];
const INPUT_ROLES: GenerationAssetRole[] = [
  'PERSON',
  'GARMENT',
  'REFERENCE',
  'SOURCE',
  'MASK',
];

export class GenerationInputDto {
  @IsUUID()
  assetId!: string;
  @IsIn(INPUT_ROLES)
  role!: GenerationAssetRole;
}

export class CreateGenerationDto {
  @IsIn(GENERATION_TYPES)
  type!: GenerationType;
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => GenerationInputDto)
  inputs!: GenerationInputDto[];
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}
