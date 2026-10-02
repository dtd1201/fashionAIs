import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { CreditsModule } from '../credits/credits.module';
import { GenerationsController } from './generations.controller';
import { GenerationsService } from './generations.service';
import { GenerationRequestValidator } from './generation-request.validator';

@Module({
  imports: [AuthModule, OrganizationsModule, AiModule, StorageModule, CreditsModule],
  controllers: [GenerationsController],
  providers: [GenerationsService, GenerationRequestValidator],
})
export class GenerationsModule {}
