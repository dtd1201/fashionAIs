import assert from 'node:assert/strict';
import test from 'node:test';
import type { GenerationDetail } from '@fashion-ais/types';
import {
  buildGenerationRequest,
  cancelGeneration,
  pollGeneration,
  submitGeneration,
} from './generation-flow';

test('builds type-safe generation inputs without provider details', () => {
  assert.deepEqual(buildGenerationRequest({ type: 'VIRTUAL_TRY_ON', prompt: '', instruction: '', primaryAssetId: 'person', secondaryAssetId: 'garment' }), {
    type: 'VIRTUAL_TRY_ON',
    inputs: [{ assetId: 'person', role: 'PERSON' }, { assetId: 'garment', role: 'GARMENT' }],
    parameters: {},
  });
  assert.throws(() => buildGenerationRequest({ type: 'VIRTUAL_TRY_ON', prompt: '', instruction: '', primaryAssetId: 'person' }), /required/);
  assert.deepEqual(buildGenerationRequest({ type: 'IMAGE_GENERATION', prompt: ' editorial ', instruction: '' }).parameters, { prompt: 'editorial' });
});

const detail = (status: GenerationDetail['status']): GenerationDetail => ({
  id: 'generation-id',
  organizationId: 'organization-id',
  type: 'IMAGE_GENERATION',
  status,
  parameters: { prompt: 'A studio fashion portrait' },
  creditCost: 0,
  errorCode: null,
  errorMessage: null,
  startedAt: null,
  completedAt: null,
  failedAt: null,
  cancelledAt: null,
  createdAt: '',
  updatedAt: '',
  inputs: [],
  outputs: [],
  job: {
    id: 'job-id',
    status:
      status === 'COMPLETED'
        ? 'SUCCEEDED'
        : status === 'FAILED'
          ? 'FAILED'
          : status === 'CANCELLED'
            ? 'CANCELLED'
            : 'PROCESSING',
    attempt: 1,
    maxAttempts: 3,
    errorCode: null,
    errorMessage: null,
  },
});

test('submits input asset IDs using current organization', async () => {
  let path = '';
  let body = '';
  await submitGeneration({
    organizationId: 'organization-id',
    input: {
      type: 'IMAGE_GENERATION',
      inputs: [{ assetId: 'asset-id', role: 'SOURCE' }],
      parameters: { prompt: 'A studio fashion portrait' },
    },
    request: <T>(next: string, init?: RequestInit) => {
      path = next;
      body = String(init?.body);
      return Promise.resolve({
        generation: detail('QUEUED'),
        job: detail('QUEUED').job,
      } as T);
    },
  });
  assert.equal(path, '/organizations/organization-id/generations');
  assert.equal(JSON.parse(body).inputs[0].assetId, 'asset-id');
});

for (const terminal of ['COMPLETED', 'FAILED', 'CANCELLED'] as const) {
  test(`polling stops and exposes ${terminal} status/output metadata`, async () => {
    let calls = 0;
    const updates: string[] = [];
    const result = await pollGeneration({
      organizationId: 'organization-id',
      generationId: 'generation-id',
      request: <T>() => {
        calls += 1;
        return Promise.resolve(
          (calls === 1
            ? detail('PROCESSING')
            : {
                ...detail(terminal),
                outputs:
                  terminal === 'COMPLETED'
                    ? [
                        {
                          id: 'output',
                          position: 0,
                          asset: {
                            id: 'asset',
                            organizationId: 'organization-id',
                            kind: 'IMAGE',
                            status: 'READY',
                            originalFileName: 'mock.png',
                            mimeType: 'image/png',
                            fileSize: 8,
                            width: null,
                            height: null,
                            durationSeconds: null,
                            checksumSha256: null,
                            createdAt: '',
                            updatedAt: '',
                            readyAt: '',
                            deletedAt: null,
                          },
                        },
                      ]
                    : [],
              }) as T,
        );
      },
      wait: () => Promise.resolve(),
      onUpdate: (value) => updates.push(value.status),
    });
    assert.equal(calls, 2);
    assert.equal(result?.status, terminal);
    assert.deepEqual(updates, ['PROCESSING', terminal]);
  });
}

test('calls cancel endpoint', async () => {
  let path = '';
  await cancelGeneration(
    'organization-id',
    'generation-id',
    <T>(next: string) => {
      path = next;
      return Promise.resolve({} as T);
    },
  );
  assert.equal(
    path,
    '/organizations/organization-id/generations/generation-id/cancel',
  );
});

test('frontend flow contains no provider secrets', () => {
  const source = `${submitGeneration.toString()}${pollGeneration.toString()}`;
  for (const term of [
    ['AI', 'API', 'KEY'].join('_'),
    ['provider', 'Secret'].join(''),
  ])
    assert.equal(source.includes(term), false);
});
