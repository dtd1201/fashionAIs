import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthUser, CreditBalanceView, CreditLedgerListResponse, CreditUsageSummaryView } from '@fashion-ais/types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreditsService } from './credits.service';
import { ListCreditLedgerDto } from './dto/list-credit-ledger.dto';

@Controller('organizations/:organizationId/credits')
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(private readonly credits: CreditsService) {}
  @Get() balance(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string): Promise<CreditBalanceView> { return this.credits.getBalance(user.id, organizationId); }
  @Get('usage') usage(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string): Promise<CreditUsageSummaryView> { return this.credits.getUsageSummary(user.id, organizationId); }
  @Get('ledger') ledger(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string, @Query() query: ListCreditLedgerDto): Promise<CreditLedgerListResponse> { return this.credits.listLedger(user.id, organizationId, query.limit, query.cursor); }
}
