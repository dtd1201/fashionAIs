import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { canonicalMessage, type Env } from '../src/index';

class TestFixedLengthStream {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;

  constructor(_expectedLength: number | bigint) {
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    this.readable = stream.readable;
    this.writable = stream.writable;
  }
}

Object.defineProperty(globalThis, 'FixedLengthStream', {
  configurable: true,
  value: TestFixedLengthStream,
});

const secret = 'test-signing-secret-with-at-least-32-characters';
const key = 'organizations/org-id/assets/asset-id/source.jpg';

class MockBucket {
  objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  deleted: string[] = [];
  putCalls = 0;
  putError?: Error;

  async put(
    objectKey: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    this.putCalls += 1;
    const bytes =
      body instanceof Uint8Array
        ? Uint8Array.from(body)
        : new Uint8Array(await new Response(body).arrayBuffer());
    if (this.putError) throw this.putError;
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
    contentLength?: string | null;
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
  if (options.contentLength === null) headers.delete('content-length');
  else if (options.contentLength !== undefined) {
    headers.set('content-length', options.contentLength);
  }
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

test('valid PUT below and exactly at maxBytes succeeds', async () => {
  for (const [body, maxBytes] of [['', 0], ['four', 5], ['12345', 5]] as const) {
    const bucket = new MockBucket();
    const response = await worker.fetch(
      await signedRequest('PUT', key, {
        maxBytes,
        body: new Blob([body]),
      }),
      environment(bucket),
    );

    assert.equal(response.status, 204);
    assert.equal(bucket.objects.get(key)?.bytes.byteLength, body.length);
  }
});

test('rejects bodies smaller or larger than declared Content-Length', async () => {
  for (const [body, contentLength] of [['four', '5'], ['longer', '4']] as const) {
    const bucket = new MockBucket();
    const response = await worker.fetch(
      await signedRequest('PUT', key, {
        maxBytes: 10,
        body: new Blob([body]),
        contentLength,
      }),
      environment(bucket),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'CONTENT_LENGTH_MISMATCH' });
    assert.equal(bucket.objects.has(key), false);
  }
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
  const bucket = new MockBucket();
  const env = environment(bucket);
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
  assert.equal(bucket.putCalls, 0);
});

test('missing Content-Length cannot bypass streamed maxBytes enforcement', async () => {
  const bucket = new MockBucket();
  const response = await worker.fetch(
    await signedRequest('PUT', key, {
      maxBytes: 4,
      body: new Blob(['oversized']),
      contentLength: null,
    }),
    environment(bucket),
  );

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: 'OBJECT_TOO_LARGE' });
  assert.equal(bucket.objects.has(key), false);
});

test('missing Content-Length below maxBytes succeeds through bounded buffering', async () => {
  const bucket = new MockBucket();
  const response = await worker.fetch(
    await signedRequest('PUT', key, {
      maxBytes: 10,
      body: new Blob(['body']),
      contentLength: null,
    }),
    environment(bucket),
  );

  assert.equal(response.status, 204);
  assert.equal(new TextDecoder().decode(bucket.objects.get(key)?.bytes), 'body');
});

test('actual body larger than declared maxBytes is rejected without replacing an object', async () => {
  const bucket = new MockBucket();
  const original = new TextEncoder().encode('original');
  bucket.objects.set(key, { bytes: original, contentType: 'image/jpeg' });
  const response = await worker.fetch(
    await signedRequest('PUT', key, {
      contentType: 'image/jpeg',
      maxBytes: 4,
      body: new Blob(['oversized'], { type: 'image/jpeg' }),
      contentLength: '4',
    }),
    environment(bucket),
  );

  assert.equal(response.status, 413);
  assert.deepEqual(bucket.objects.get(key)?.bytes, original);
  assert.deepEqual(bucket.deleted, []);
});

test('rejects malformed Content-Length before writing to R2', async () => {
  for (const contentLength of ['', '-1', '1.5', '1e3', '9007199254740992']) {
    const bucket = new MockBucket();
    const response = await worker.fetch(
      await signedRequest('PUT', key, {
        maxBytes: 10,
        body: new Blob(['body']),
        contentLength,
      }),
      environment(bucket),
    );

    assert.equal(response.status, 400, contentLength);
    assert.deepEqual(await response.json(), { error: 'INVALID_CONTENT_LENGTH' });
    assert.equal(bucket.putCalls, 0);
  }
});

test('rejects invalid or absurd signed maxBytes values', async () => {
  for (const maxBytes of [-1, 1.5, Number.MAX_SAFE_INTEGER, Number.NaN]) {
    const response = await worker.fetch(
      await signedRequest('PUT', key, {
        maxBytes,
        body: new Blob(['body']),
      }),
      environment(),
    );
    assert.equal(response.status, 403, String(maxBytes));
    assert.deepEqual(await response.json(), { error: 'INVALID_SIGNATURE' });
  }

  const exponential = await signedRequest('PUT', key, {
    maxBytes: 1000,
    body: new Blob(['body']),
  });
  const exponentialUrl = new URL(exponential.url);
  exponentialUrl.searchParams.set('maxBytes', '1e3');
  const response = await worker.fetch(
    new Request(exponentialUrl, exponential),
    environment(),
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'INVALID_SIGNATURE' });
});

test('signature cannot be reused after modifying maxBytes', async () => {
  const request = await signedRequest('PUT', key, {
    maxBytes: 4,
    body: new Blob(['body']),
  });
  const url = new URL(request.url);
  url.searchParams.set('maxBytes', '4000');
  const response = await worker.fetch(
    new Request(url, request),
    environment(),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'INVALID_SIGNATURE' });
});

test('unexpected R2 put failures are logged and return a controlled 500', async () => {
  const bucket = new MockBucket();
  bucket.putError = new Error('R2 runtime rejected write');
  const originalConsoleError = console.error;
  const logs: unknown[] = [];
  console.error = (...values: unknown[]) => logs.push(...values);
  try {
    const response = await worker.fetch(
      await signedRequest('PUT', key, {
        maxBytes: 10,
        body: new Blob(['body']),
      }),
      environment(bucket),
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: 'STORAGE_WRITE_FAILED' });
    assert.deepEqual(logs, [{
      operation: 'r2.put',
      errorName: 'Error',
      errorMessage: 'R2 runtime rejected write',
    }]);
  } finally {
    console.error = originalConsoleError;
  }
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
