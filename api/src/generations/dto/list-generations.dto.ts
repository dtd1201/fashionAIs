import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { GenerationStatus, GenerationType } from '@fashion-ais/types';

const TYPES: GenerationType[] = [
  'VIRTUAL_TRY_ON',
  'MODEL_GENERATION',
  'PHOTOSHOOT',
  'IMAGE_GENERATION',
  'VIDEO_GENERATION',
];
const STATUSES: GenerationStatus[] = [
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED',
];

export class ListGenerationsDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(TYPES) type?: GenerationType;
  @IsOptional() @IsIn(STATUSES) status?: GenerationStatus;
}
