import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetView, GenerationDetail } from '@fashion-ais/types';
import { applyStudioReuse, buildUseAgainUrl, selectExistingAsset } from './studio-library';

const asset = (id: string): AssetView => ({ id, organizationId: 'org', kind: 'IMAGE', status: 'READY', originalFileName: `${id}.jpg`, mimeType: 'image/jpeg', fileSize: 1, width: null, height: null, durationSeconds: null, checksumSha256: null, createdAt: '', updatedAt: '', readyAt: '', deletedAt: null });

test('selects existing PERSON and GARMENT assets without upload or asset creation', () => {
  const selected: string[] = [];
  const upload = () => { throw new Error('upload must not run'); };
  selectExistingAsset('PERSON', asset('person'), (role, value) => selected.push(`${role}:${value.id}`));
  selectExistingAsset('GARMENT', asset('garment'), (role, value) => selected.push(`${role}:${value.id}`));
  assert.deepEqual(selected, ['PERSON:person', 'GARMENT:garment']);
  assert.equal(typeof upload, 'function');
});

test('Use Again hydrates owned ready assets and prompt without starting generation', () => {
  const generationRequests = 0;
  const hydrated = applyStudioReuse('?person=person&garment=garment&prompt=editorial', [asset('person'), asset('garment')], { prompt: '', resolution: '', generationMode: '', outputCount: 1 });
  assert.equal(hydrated.person?.id, 'person');
  assert.equal(hydrated.garment?.id, 'garment');
  assert.equal(hydrated.settings.prompt, 'editorial');
  assert.equal(generationRequests, 0);
});

test('builds a Studio reuse URL from generation inputs', () => {
  const generation = { id: 'gen', organizationId: 'org', type: 'VIRTUAL_TRY_ON', status: 'COMPLETED', parameters: { prompt: 'soft light' }, creditCost: 1, errorCode: null, errorMessage: null, startedAt: null, completedAt: null, failedAt: null, cancelledAt: null, createdAt: '', updatedAt: '', inputs: [{ id: 'i1', role: 'PERSON', asset: asset('person') }, { id: 'i2', role: 'GARMENT', asset: asset('garment') }], outputs: [], job: { id: 'job', status: 'SUCCEEDED', attempt: 1, maxAttempts: 3, errorCode: null, errorMessage: null, provider: 'MOCK' } } satisfies GenerationDetail;
  assert.equal(buildUseAgainUrl(generation), '/studio?person=person&garment=garment&prompt=soft+light');
});
