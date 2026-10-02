/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/require-await */
import type { Asset } from '@prisma/client';
import {
  type FashnLiveDependencies,
  verifyFashnLive,
} from '../src/scripts/verify-fashn-live';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const personId = '33333333-3333-4333-8333-333333333333';
const garmentId = '44444444-4444-4444-8444-444444444444';

function asset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    organizationId,
    createdByUserId: userId,
    kind: 'IMAGE',
    status: 'READY',
    storageProvider: 'R2',
    bucket: 'private',
    objectKey: `assets/${id}`,
    originalFileName: `${id}.png`,
    mimeType: 'image/png',
    fileSize: 4,
    width: null,
    height: null,
    durationSeconds: null,
    checksumSha256: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    readyAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    FASHN_LIVE_TEST_ENABLED: 'true',
    FASHN_LIVE_TEST_DRY_RUN: 'true',
    FASHN_TEST_ORGANIZATION_ID: organizationId,
    FASHN_TEST_USER_ID: userId,
    FASHN_TEST_PERSON_ASSET_ID: personId,
    FASHN_TEST_GARMENT_ASSET_ID: garmentId,
    ...overrides,
  };
}

function harness(assetOverrides: Asset[] = [asset(personId), asset(garmentId)]) {
  const logs: string[] = [];
  let now = 0;
  const dependencies: FashnLiveDependencies = {
    databaseHealthy: jest.fn().mockResolvedValue(true),
    redisPing: jest.fn().mockResolvedValue('PONG'),
    storageConfigured: jest.fn(() => true),
    validateRequest: jest.fn().mockResolvedValue(undefined),
    loadAssets: jest.fn().mockResolvedValue(assetOverrides),
    createSignedUrl: jest.fn().mockResolvedValue(undefined),
    createGeneration: jest.fn().mockResolvedValue({ generationId: 'generation', aiJobId: 'job' }),
    loadGeneration: jest.fn().mockResolvedValue({
      id: 'generation', status: 'COMPLETED', errorCode: null, errorMessage: null,
      aiJob: { id: 'job', status: 'SUCCEEDED', providerJobId: 'prediction', errorCode: null, errorMessage: null },
      outputs: [{ asset: asset('output') }],
    }),
    headOutput: jest.fn().mockResolvedValue({ exists: true, contentLength: 4 }),
    sleep: jest.fn(async (milliseconds) => { now += milliseconds; }),
    now: jest.fn(() => now),
    log: jest.fn((message: string) => logs.push(message)),
  };
  return { dependencies, logs };
}

describe('manual FASHN live verification', () => {
  it('requires the explicit gate and requires a key only for paid mode', async () => {
    await expect(verifyFashnLive(environment({ FASHN_LIVE_TEST_ENABLED: 'false' }), harness().dependencies)).rejects.toThrow('disabled');
    await expect(verifyFashnLive(environment({ FASHN_LIVE_TEST_DRY_RUN: 'false' }), harness().dependencies)).rejects.toThrow('FASHN_API_KEY');
  });

  it('dry-run completes preflight and never creates a generation', async () => {
    const state = harness();
    await expect(verifyFashnLive(environment(), state.dependencies)).resolves.toEqual({ dryRun: true });
    expect(state.dependencies.createSignedUrl).toHaveBeenCalledTimes(2);
    expect(state.dependencies.createGeneration).not.toHaveBeenCalled();
    expect(state.logs.join('\n')).not.toContain('secret');
  });

  it('stops on invalid organization or asset validation', async () => {
    const invalidOrganization = harness();
    jest.mocked(invalidOrganization.dependencies.validateRequest).mockRejectedValue(new Error('organization invalid'));
    await expect(verifyFashnLive(environment(), invalidOrganization.dependencies)).rejects.toThrow('organization invalid');
    expect(invalidOrganization.dependencies.createGeneration).not.toHaveBeenCalled();

    for (const invalid of [
      [asset(personId, { status: 'FAILED' }), asset(garmentId)],
      [asset(personId), asset(garmentId, { organizationId: '55555555-5555-4555-8555-555555555555' })],
      [asset(personId, { kind: 'VIDEO' }), asset(garmentId)],
    ]) {
      const state = harness(invalid);
      await expect(verifyFashnLive(environment(), state.dependencies)).rejects.toThrow();
      expect(state.dependencies.createGeneration).not.toHaveBeenCalled();
    }
  });

  it('paid mode creates one fixed generation and verifies its output', async () => {
    const state = harness();
    await expect(verifyFashnLive(environment({ FASHN_LIVE_TEST_DRY_RUN: 'false', FASHN_API_KEY: 'test-only-secret' }), state.dependencies)).resolves.toEqual({ dryRun: false, generationId: 'generation' });
    expect(state.dependencies.createGeneration).toHaveBeenCalledTimes(1);
    expect(state.dependencies.headOutput).toHaveBeenCalledTimes(1);
    expect(state.logs.join('\n')).toContain('resolution=1k generation_mode=fast num_images=1');
    expect(state.logs.join('\n')).not.toContain('test-only-secret');
  });

  it('times out without creating a second generation', async () => {
    const state = harness();
    jest.mocked(state.dependencies.loadGeneration).mockResolvedValue({
      id: 'generation', status: 'PROCESSING', errorCode: null, errorMessage: null,
      aiJob: { id: 'job', status: 'PROCESSING', providerJobId: 'prediction', errorCode: null, errorMessage: null }, outputs: [],
    });
    await expect(verifyFashnLive(environment({ FASHN_LIVE_TEST_DRY_RUN: 'false', FASHN_API_KEY: 'test-only-secret', FASHN_LIVE_TEST_TIMEOUT_MS: '1000' }), state.dependencies)).rejects.toThrow('timed out');
    expect(state.dependencies.createGeneration).toHaveBeenCalledTimes(1);
  });
});
