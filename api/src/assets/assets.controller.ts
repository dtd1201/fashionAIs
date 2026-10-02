import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AssetAccessUrlResponse,
  AssetListResponse,
  AssetView,
  AuthUser,
  CompleteAssetResponse,
  CreateAssetUploadResponse,
} from '@fashion-ais/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithId } from '../common/types/request-with-id';
import { AssetsService } from './assets.service';
import { CreateAssetUploadDto } from './dto/create-asset-upload.dto';
import { ListAssetsDto } from './dto/list-assets.dto';

@Controller('organizations/:organizationId/assets')
@UseGuards(JwtAuthGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post('uploads')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createUpload(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateAssetUploadDto,
    @Req() request: RequestWithId,
  ): Promise<CreateAssetUploadResponse> {
    return this.assets.createUpload(user.id, organizationId, dto, {
      requestId: request.requestId,
    });
  }

  @Post(':assetId/complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
    @Req() request: RequestWithId,
  ): Promise<CompleteAssetResponse> {
    return this.assets.completeUpload(user.id, organizationId, assetId, {
      requestId: request.requestId,
    });
  }

  @Post(':assetId/fail')
  fail(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
    @Req() request: RequestWithId,
  ): Promise<AssetView> {
    return this.assets.failUpload(user.id, organizationId, assetId, {
      requestId: request.requestId,
    });
  }

  @Get(':assetId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
  ): Promise<AssetView> {
    return this.assets.get(user.id, organizationId, assetId);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query() query: ListAssetsDto,
  ): Promise<AssetListResponse> {
    return this.assets.list(user.id, organizationId, query);
  }

  @Post(':assetId/access-url')
  createAccessUrl(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
    @Req() request: RequestWithId,
  ): Promise<AssetAccessUrlResponse> {
    return this.assets.createAccessUrl(user.id, organizationId, assetId, {
      requestId: request.requestId,
    });
  }

  @Delete(':assetId')
  delete(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('assetId') assetId: string,
    @Req() request: RequestWithId,
  ): Promise<AssetView> {
    return this.assets.delete(user.id, organizationId, assetId, {
      requestId: request.requestId,
    });
  }
}
