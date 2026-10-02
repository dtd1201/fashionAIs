import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetView } from '@fashion-ais/types';
import { buildTryOnRequest, canBootstrapStudioData, canGenerate, estimatedTryOnCost, handleGenerationGate, loadAssetAccessUrl } from './studio-flow';

const asset = (id: string, status: AssetView['status'] = 'READY'): AssetView => ({
  id, organizationId: 'organization', kind: 'IMAGE', status,
  originalFileName: `${id}.png`, mimeType: 'image/png', fileSize: 10,
  width: null, height: null, durationSeconds: null, checksumSha256: null,
  createdAt: '', updatedAt: '', readyAt: '', deletedAt: null,
});

test('anonymous Studio performs zero credit and asset requests', async () => {
  const calls: string[] = [];
  const request = async (path: string): Promise<void> => {
    calls.push(path);
  };

  if (canBootstrapStudioData('anonymous', undefined)) {
    await Promise.all([
      request('/organizations/organization-id/credits'),
      request('/organizations/organization-id/assets'),
    ]);
  }

  assert.deepEqual(calls, []);
});

test('Studio generation remains gated by inputs, not payment', () => {
  assert.equal(canGenerate(null, asset('garment')), false);
  assert.equal(canGenerate(asset('person'), null), false);
  assert.equal(canGenerate(asset('person', 'FAILED'), asset('garment')), false);
  assert.equal(canGenerate(asset('person'), asset('garment')), true);
  assert.deepEqual(handleGenerationGate(), { allowed: true });
});

test('opening Studio has no purchase redirect or credit requirement', () => {
  assert.deepEqual(handleGenerationGate(), { allowed: true });
  assert.equal(handleGenerationGate().allowed, true);
});

test('estimated cost follows output count', () => {
  assert.equal(estimatedTryOnCost({ prompt: '', resolution: '', generationMode: '', outputCount: 1 }), 1);
  assert.equal(estimatedTryOnCost({ prompt: '', resolution: '4k', generationMode: 'quality', outputCount: 4 }), 4);
});

test('builds the existing VIRTUAL_TRY_ON request with PERSON and GARMENT', () => {
  assert.deepEqual(buildTryOnRequest(asset('person'), asset('garment'), {
    prompt: ' editorial ', resolution: '1k', generationMode: 'fast', outputCount: 1,
  }), {
    type: 'VIRTUAL_TRY_ON',
    inputs: [{ assetId: 'person', role: 'PERSON' }, { assetId: 'garment', role: 'GARMENT' }],
    parameters: { prompt: 'editorial', resolution: '1k', generation_mode: 'fast', num_images: 1 },
  });
});

test('loads image access URLs through the existing organization asset API', async () => {
  let path = ''; let method = '';
  const url = await loadAssetAccessUrl({ organizationId: 'organization', assetId: 'asset', request: <T>(next: string, init?: RequestInit) => { path = next; method = init?.method ?? ''; return Promise.resolve({ url: 'https://signed.example/image' } as T); } });
  assert.equal(path, '/organizations/organization/assets/asset/access-url');
  assert.equal(method, 'POST');
  assert.equal(url, 'https://signed.example/image');
});
