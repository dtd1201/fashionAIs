import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Min,
  NotContains,
} from 'class-validator';

export const SUPPORTED_ASSET_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
] as const;

export class CreateAssetUploadDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @Length(1, 255)
  @NotContains('/')
  @NotContains('\\')
  fileName!: string;

  @IsIn(SUPPORTED_ASSET_MIME_TYPES, { message: 'ASSET_INVALID_FILE_TYPE' })
  mimeType!: (typeof SUPPORTED_ASSET_MIME_TYPES)[number];

  @IsInt()
  @Min(1)
  fileSize!: number;
}
