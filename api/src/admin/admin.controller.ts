import { Body, Controller, Get, Logger, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthUser, CreditBalanceView } from '@fashion-ais/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SystemAdminGuard } from '../auth/system-admin.guard';
import { CreditsService } from '../credits/credits.service';
import { AdjustCreditsDto } from './dto/adjust-credits.dto';
import { AdminCreditsQueryDto, AdminGenerationsQueryDto, AdminListDto, AdminUsersQueryDto } from './dto/admin-list.dto';
import { AdminService } from './admin.service';
import type { RequestWithId } from '../common/types/request-with-id';
import { Throttle } from '@nestjs/throttler';

@Controller('admin')
@UseGuards(JwtAuthGuard, SystemAdminGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);
  constructor(private readonly credits: CreditsService, private readonly admin: AdminService) {}
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @Get('overview') overview() { return this.admin.overview(); }
  @Get('users') users(@Query() query: AdminUsersQueryDto) { return this.admin.users(query); }
  @Get('users/:id') user(@Param('id') id: string) { return this.admin.user(id); }
  @Get('organizations') organizations(@Query() query: AdminListDto) { return this.admin.organizations(query); }
  @Get('organizations/:id') organization(@Param('id') id: string) { return this.admin.organization(id); }
  @Get('generations') generations(@Query() query: AdminGenerationsQueryDto) { return this.admin.generations(query); }
  @Get('generations/:id') generation(@Param('id') id: string) { return this.admin.generation(id); }
  @Get('credits') creditAdmin(@Query() query: AdminCreditsQueryDto) { return this.admin.credits(query); }
  @Get('billing') billing() { return this.admin.billing(); }
  @Get('system') system() { return this.admin.system(); }

  @Post('organizations/:organizationId/credits/adjust')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  adjustCredits(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Body() dto: AdjustCreditsDto,
    @Req() request: RequestWithId,
  ): Promise<CreditBalanceView> {
    this.logger.log({ adminUserId: user.id, targetOrganizationId: organizationId, action: 'credit-adjustment', amount: dto.amount, reason: dto.reason, requestId: request.requestId });
    return this.credits.adjust(organizationId, user.id, dto.amount, dto.reason);
  }
}
