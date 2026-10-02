import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AuthUser,
  CancelGenerationResponse,
  CreateGenerationResponse,
  GenerationDetail,
  GenerationListResponse,
} from '@fashion-ais/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateGenerationDto } from './dto/create-generation.dto';
import { ListGenerationsDto } from './dto/list-generations.dto';
import { GenerationsService } from './generations.service';
import { GenerationRequestValidator } from './generation-request.validator';

@Controller('organizations/:organizationId/generations')
@UseGuards(JwtAuthGuard)
export class GenerationsController {
  constructor(
    private readonly generations: GenerationsService,
    private readonly validator: GenerationRequestValidator,
  ) {}
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async create(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateGenerationDto,
    @Headers('idempotency-key') key?: string,
  ): Promise<CreateGenerationResponse> {
    const request = await this.validator.validate(user.id, organizationId, dto);
    return this.generations.create(user.id, organizationId, request, key);
  }
  @Get(':generationId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('generationId') generationId: string,
  ): Promise<GenerationDetail> {
    return this.generations.get(user.id, organizationId, generationId);
  }
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query() query: ListGenerationsDto,
  ): Promise<GenerationListResponse> {
    return this.generations.list(user.id, organizationId, query);
  }
  @Post(':generationId/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('generationId') generationId: string,
  ): Promise<CancelGenerationResponse> {
    return this.generations.cancel(user.id, organizationId, generationId);
  }
}
