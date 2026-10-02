import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { GenerationCostService } from './generation-cost.service';

@Global()
@Module({ imports: [AuthModule, OrganizationsModule], controllers: [CreditsController], providers: [CreditsService, GenerationCostService], exports: [CreditsService, GenerationCostService] })
export class CreditsModule {}
