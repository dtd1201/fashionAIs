import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AssetKind, AssetStatus } from '@fashion-ais/types';

const ASSET_KINDS: AssetKind[] = ['IMAGE', 'VIDEO', 'DOCUMENT', 'OTHER'];
const ASSET_STATUSES: AssetStatus[] = [
  'PENDING_UPLOAD',
  'READY',
  'FAILED',
  'DELETED',
];

export class ListAssetsDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(ASSET_KINDS)
  kind?: AssetKind;

  @IsOptional()
  @IsIn(ASSET_STATUSES)
  status?: AssetStatus;

  @IsOptional()
  @IsIn(['UPLOADED', 'GENERATED'])
  source?: 'UPLOADED' | 'GENERATED';
}
