import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SystemAdminGuard } from './system-admin.guard';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, SystemAdminGuard],
  exports: [JwtModule, JwtAuthGuard, SystemAdminGuard],
})
export class AuthModule {}
