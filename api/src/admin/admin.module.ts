import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { CreditsModule } from '../credits/credits.module';
import { AdminService } from './admin.service';

@Module({ imports: [AuthModule, CreditsModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
