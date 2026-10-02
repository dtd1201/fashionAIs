import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { canonicalMessage, type Env } from '../src/index';

const secret = 'test-signing-secret-with-at-least-32-characters';
const key = 'organizations/org-id/assets/asset-id/source.jpg';

class MockBucket {
  objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  deleted: string[] = [];

  async put(
    objectKey: string,
    body: ReadableStream<Uint8Array>,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    this.objects.set(objectKey, {
      bytes,
      contentType: options?.httpMetadata?.contentType,
    });
  }

  get(objectKey: string) {
    const stored = this.objects.get(objectKey);
    return Promise.resolve(stored ? this.object(stored) : null);
  }

  head(objectKey: string) {
    const stored = this.objects.get(objectKey);
    return Promise.resolve(stored ? this.object(stored) : null);
  }

  delete(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
    this.deleted.push(objectKey);
    return Promise.resolve();
  }

  private object(stored: { bytes: Uint8Array; contentType?: string }) {
    return {
      size: stored.bytes.byteLength,
      httpEtag: '"etag"',
      httpMetadata: { contentType: stored.contentType },
      body: new Blob([Uint8Array.from(stored.bytes).buffer]).stream(),
      writeHttpMetadata(headers: Headers) {
        if (stored.contentType) headers.set('content-type', stored.contentType);
      },
    };
  }
}

function environment(bucket = new MockBucket()): Env {
  return {
    ASSETS_BUCKET: bucket,
    R2_GATEWAY_SIGNING_SECRET: secret,
    ALLOWED_ORIGINS: 'http://localhost:3000,https://app.example.com',
  } as unknown as Env;
}

async function signedRequest(
  method: 'PUT' | 'GET' | 'HEAD' | 'DELETE',
  objectKey = key,
  options: {
    expiresAt?: number;
    contentType?: string;
    maxBytes?: number;
    requestMethod?: string;
    origin?: string;
    body?: BodyInit;
    signature?: string;
  } = {},
): Promise<Request> {
  const expiresAt = options.expiresAt ?? Math.floor(Date.now() / 1000) + 600;
  const message = canonicalMessage({
    method,
    objectKey,
    expiresAt,
    contentType: options.contentType,
    maxBytes: options.maxBytes,
  });
  const signature = options.signature ?? (await hmac(message));
  const url = new URL(
    `https://gateway.example/objects/${encodeURIComponent(objectKey)}`,
  );
  url.searchParams.set('expires', String(expiresAt));
  url.searchParams.set('signature', signature);
  if (options.contentType) url.searchParams.set('contentType', options.contentType);
  if (options.maxBytes !== undefined) url.searchParams.set('maxBytes', String(options.maxBytes));
  const headers = new Headers();
  if (options.origin) headers.set('origin', options.origin);
  if (options.contentType) headers.set('content-type', options.contentType);
  if (options.body instanceof Blob) headers.set('content-length', String(options.body.size));
  return new Request(url, {
    method: options.requestMethod ?? method,
    headers,
    body: options.body,
  });
}

async function hmac(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const value = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Buffer.from(value).toString('hex');
}

test('valid PUT streams into R2 with signed metadata', async () => {
  const bucket = new MockBucket();
  const env = environment(bucket);
  const response = await worker.fetch(
    await signedRequest('PUT', key, {
      contentType: 'image/jpeg',
      maxBytes: 5,
      body: new Blob(['image'], { type: 'image/jpeg' }),
      origin: 'http://localhost:3000',
    }),
    env,
  );

  assert.equal(response.status, 204);
  assert.equal(bucket.objects.get(key)?.contentType, 'image/jpeg');
  assert.equal(bucket.objects.get(key)?.bytes.byteLength, 5);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:3000');
});

test('valid GET streams the object and metadata', async () => {
  const bucket = new MockBucket();
  bucket.objects.set(key, { bytes: new TextEncoder().encode('image'), contentType: 'image/jpeg' });
  const response = await worker.fetch(await signedRequest('GET'), environment(bucket));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(response.headers.get('etag'), '"etag"');
  assert.equal(await response.text(), 'image');
});

test('valid HEAD returns metadata without a body', async () => {
  const bucket = new MockBucket();
  bucket.objects.set(key, { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' });
  const response = await worker.fetch(await signedRequest('HEAD'), environment(bucket));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-length'), '3');
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(await response.text(), '');
});

test('valid DELETE removes the exact signed key', async () => {
  const bucket = new MockBucket();
  bucket.objects.set(key, { bytes: new Uint8Array([1]) });
  const response = await worker.fetch(await signedRequest('DELETE'), environment(bucket));

  assert.equal(response.status, 204);
  assert.deepEqual(bucket.deleted, [key]);
  assert.equal(bucket.objects.has(key), false);
});

test('rejects expired, invalid, method-mismatched, and key-tampered signatures', async () => {
  const env = environment();
  const expired = await worker.fetch(
    await signedRequest('GET', key, { expiresAt: Math.floor(Date.now() / 1000) - 1 }),
    env,
  );
  const invalid = await worker.fetch(
    await signedRequest('GET', key, { signature: '0'.repeat(64) }),
    env,
  );
  const mismatch = await worker.fetch(
    await signedRequest('GET', key, { requestMethod: 'DELETE' }),
    env,
  );
  const original = await signedRequest('GET');
  const tamperedUrl = new URL(original.url);
  tamperedUrl.pathname = `/objects/${encodeURIComponent(`${key}.tampered`)}`;
  const tampered = await worker.fetch(new Request(tamperedUrl), env);

  assert.equal(expired.status, 403);
  assert.deepEqual(await expired.json(), { error: 'EXPIRED_SIGNATURE' });
  assert.equal(invalid.status, 403);
  assert.equal(mismatch.status, 403);
  assert.equal(tampered.status, 403);
});

test('returns OBJECT_NOT_FOUND for missing GET and HEAD objects', async () => {
  const env = environment();
  const get = await worker.fetch(await signedRequest('GET'), env);
  const head = await worker.fetch(await signedRequest('HEAD'), env);

  assert.equal(get.status, 404);
  assert.equal(head.status, 404);
});

test('enforces signed upload content type and declared maximum size', async () => {
  const env = environment();
  const wrongTypeRequest = await signedRequest('PUT', key, {
    contentType: 'image/jpeg',
    maxBytes: 10,
    body: new Blob(['image'], { type: 'image/jpeg' }),
  });
  wrongTypeRequest.headers.set('content-type', 'image/png');
  const wrongType = await worker.fetch(wrongTypeRequest, env);
  const tooLarge = await worker.fetch(
    await signedRequest('PUT', key, {
      contentType: 'image/jpeg',
      maxBytes: 2,
      body: new Blob(['image'], { type: 'image/jpeg' }),
    }),
    env,
  );

  assert.equal(wrongType.status, 415);
  assert.deepEqual(await wrongType.json(), { error: 'INVALID_CONTENT_TYPE' });
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(await tooLarge.json(), { error: 'OBJECT_TOO_LARGE' });
});

test('does not expose listing or keys outside the server-owned namespace', async () => {
  const env = environment();
  const list = await worker.fetch(new Request('https://gateway.example/objects'), env);
  const arbitraryKey = await worker.fetch(
    await signedRequest('GET', 'unowned/file.jpg'),
    env,
  );

  assert.equal(list.status, 404);
  assert.equal(arbitraryKey.status, 404);
});

test('handles allowed CORS preflight and rejects disallowed origins', async () => {
  const env = environment();
  const allowed = await worker.fetch(
    new Request('https://gateway.example/objects/key', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    }),
    env,
  );
  const denied = await worker.fetch(
    new Request('https://gateway.example/objects/key', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    }),
    env,
  );

  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get('access-control-allow-methods'), 'PUT, GET, HEAD, OPTIONS');
  assert.equal(allowed.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.has('access-control-allow-origin'), false);
});
