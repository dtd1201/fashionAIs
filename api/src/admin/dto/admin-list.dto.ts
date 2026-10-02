import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AIProviderName, GenerationStatus, UserStatus } from '@prisma/client';

export class AdminListDto {
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() @MaxLength(120) search?: string;
}

export class AdminUsersQueryDto extends AdminListDto {
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() systemAdmin?: boolean;
}

export class AdminGenerationsQueryDto extends AdminListDto {
  @IsOptional() @IsEnum(GenerationStatus) status?: GenerationStatus;
  @IsOptional() @IsEnum(AIProviderName) provider?: AIProviderName;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class AdminCreditsQueryDto extends AdminListDto {
  @IsOptional() @IsUUID() organizationId?: string;
}
