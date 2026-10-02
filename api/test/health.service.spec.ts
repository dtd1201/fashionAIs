/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { HealthService } from '../src/health/health.service';

describe('HealthService', () => {
  it('reports healthy dependencies', async () => {
    const prisma = { isHealthy: jest.fn().mockResolvedValue(true) };
    const queue = { isRedisHealthy: jest.fn().mockResolvedValue(true) };
    const service = new HealthService(prisma as never, queue as never);

    await expect(service.check()).resolves.toEqual({ api: 'ok', database: 'ok', redis: 'ok' });
  });

  it('reports liveness without checking dependencies', () => {
    const prisma = { isHealthy: jest.fn() };
    const queue = { isRedisHealthy: jest.fn() };
    const service = new HealthService(prisma as never, queue as never);
    expect(service.live()).toEqual({ api: 'ok' });
    expect(prisma.isHealthy).not.toHaveBeenCalled();
  });

  it.each([['database', true, false], ['redis', false, true]] as const)('fails readiness when %s is unavailable', async (_name, databaseFails, redisFails) => {
    const prisma = { isHealthy: jest.fn(() => databaseFails ? Promise.reject(new Error('db')) : Promise.resolve(true)) };
    const queue = { isRedisHealthy: jest.fn(() => redisFails ? Promise.reject(new Error('redis')) : Promise.resolve(true)) };
    const service = new HealthService(prisma as never, queue as never);
    await expect(service.ready()).rejects.toMatchObject({ response: expect.objectContaining({ code: 'DEPENDENCY_UNAVAILABLE' }) });
  });
});
