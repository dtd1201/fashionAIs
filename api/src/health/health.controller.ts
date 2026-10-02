import { Controller, Get } from '@nestjs/common';
import type { HealthStatus } from '@fashion-ais/types';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): Promise<HealthStatus> {
    return this.healthService.check();
  }

  @Get('live')
  live(): { api: 'ok' } {
    return this.healthService.live();
  }

  @Get('ready')
  ready(): Promise<HealthStatus> {
    return this.healthService.ready();
  }
}
