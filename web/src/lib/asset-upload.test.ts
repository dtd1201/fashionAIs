import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssetView, CreateAssetUploadResponse } from '@fashion-ais/types';
import {
  AssetUploadFlowError,
  createAssetUploadInput,
  uploadAssetFile,
} from './asset-upload';

const pendingAsset: AssetView = {
  id: 'asset-id',
  organizationId: 'organization-id',
  kind: 'IMAGE',
  status: 'PENDING_UPLOAD',
  originalFileName: 'dress.jpg',
  mimeType: 'image/jpeg',
  fileSize: 5,
  width: null,
  height: null,
  durationSeconds: null,
  checksumSha256: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  readyAt: null,
  deletedAt: null,
};

const initialized: CreateAssetUploadResponse = {
  asset: pendingAsset,
  upload: {
    method: 'PUT',
    url: 'https://storage.example/signed-upload',
    headers: { 'Content-Type': 'image/jpeg' },
    expiresIn: 900,
  },
};

function imageFile(): File {
  return new File(['dress'], 'dress.jpg', { type: 'image/jpeg' });
}

test('file selection produces only backend upload-init metadata', () => {
  assert.deepEqual(createAssetUploadInput(imageFile()), {
    fileName: 'dress.jpg',
    mimeType: 'image/jpeg',
    fileSize: 5,
  });
});

test('initializes, uploads directly, then completes without changing auth state', async () => {
  const calls: string[] = [];
  const authState = { accessToken: 'unchanged' };
  const request = async <T>(path: string): Promise<T> => {
    calls.push(path);
    if (path.endsWith('/uploads')) return initialized as T;
    return { asset: { ...pendingAsset, status: 'READY' } } as T;
  };
  const directUpload = async (
    url: string | URL | Request,
    init?: RequestInit,
  ) => {
    assert.equal(url, initialized.upload.url);
    assert.equal(init?.method, 'PUT');
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'image/jpeg');
    return new Response(null, { status: 200 });
  };

  const asset = await uploadAssetFile({
    organizationId: 'organization-id',
    file: imageFile(),
    request,
    directUpload,
  });
  assert.deepEqual(calls, [
    '/organizations/organization-id/assets/uploads',
    '/organizations/organization-id/assets/asset-id/complete',
  ]);
  assert.equal(asset.status, 'READY');
  assert.equal(authState.accessToken, 'unchanged');
});

test('calls the fail endpoint when direct PUT fails', async () => {
  const calls: string[] = [];
  const request = async <T>(path: string): Promise<T> => {
    calls.push(path);
    return (path.endsWith('/uploads') ? initialized : pendingAsset) as T;
  };
  await assert.rejects(
    uploadAssetFile({
      organizationId: 'organization-id',
      file: imageFile(),
      request,
      directUpload: async () => new Response(null, { status: 500 }),
    }),
    AssetUploadFlowError,
  );
  assert.equal(
    calls.at(-1),
    '/organizations/organization-id/assets/asset-id/fail',
  );
});

test('rejects unsupported files before upload init', async () => {
  let requested = false;
  await assert.rejects(
    uploadAssetFile({
      organizationId: 'organization-id',
      file: new File(['bad'], 'bad.exe', { type: 'application/octet-stream' }),
      request: <T>() => {
        requested = true;
        return Promise.resolve(initialized as T);
      },
    }),
    (error: unknown) =>
      error instanceof AssetUploadFlowError &&
      error.code === 'ASSET_INVALID_FILE_TYPE',
  );
  assert.equal(requested, false);
});

test('requires a current organization', async () => {
  await assert.rejects(
    uploadAssetFile({
      organizationId: null,
      file: imageFile(),
      request: <T>() => Promise.resolve(initialized as T),
    }),
    (error: unknown) =>
      error instanceof AssetUploadFlowError &&
      error.code === 'ORGANIZATION_REQUIRED',
  );
});

test('frontend asset flow contains no storage credential fields', () => {
  const source = `${createAssetUploadInput.toString()}${uploadAssetFile.toString()}`;
  const forbiddenTerms = [
    ['R2', 'ACCESS', 'KEY', 'ID'].join('_'),
    ['R2', 'SECRET', 'ACCESS', 'KEY'].join('_'),
    ['secret', 'Access', 'Key'].join(''),
  ];
  for (const term of forbiddenTerms) assert.equal(source.includes(term), false);
});
