import { ConfigService } from '@nestjs/config';
import { CloudflareR2GatewayStorageProvider } from '../src/storage/cloudflare-r2-gateway-storage.provider';
import { CloudflareR2StorageProvider } from '../src/storage/cloudflare-r2-storage.provider';
import { createStorageProvider } from '../src/storage/storage.module';

const bucket = 'fashionais-assets';
const objectKey = 'organizations/org/assets/asset/source.jpg';
const signingSecret = 'test-signing-secret-with-at-least-32-characters';

describe('CloudflareR2GatewayStorageProvider', () => {
  it('generates signed Worker upload and download URLs', async () => {
    const provider = new CloudflareR2GatewayStorageProvider({
      baseUrl: 'https://gateway.example',
      signingSecret,
      bucket,
    });
    const upload = new URL(
      (
        await provider.createPresignedUpload({
          bucket,
          objectKey,
          contentType: 'image/jpeg',
          contentLength: 123,
          expiresInSeconds: 900,
        })
      ).uploadUrl,
    );
    const download = new URL(
      (await provider.createPresignedDownload(bucket, objectKey, 600))
        .downloadUrl,
    );

    expect(upload.origin).toBe('https://gateway.example');
    expect(upload.pathname).toContain('/objects/organizations%2Forg');
    expect(upload.searchParams.get('contentType')).toBe('image/jpeg');
    expect(upload.searchParams.get('maxBytes')).toBe('123');
    expect(upload.searchParams.get('signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(download.origin).toBe('https://gateway.example');
    expect(download.searchParams.has('contentType')).toBe(false);
    expect(download.searchParams.get('signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(upload.toString()).not.toContain(signingSecret);
  });

  it('uses Worker HEAD, DELETE, and PUT without R2 credentials', async () => {
    const calls: Array<{ url: URL; init: RequestInit }> = [];
    const gatewayFetch = jest.fn(
      (input: string | URL | Request, init: RequestInit = {}) => {
        const value = input instanceof Request ? input.url : input.toString();
        calls.push({ url: new URL(value), init });
        if (init.method === 'HEAD') {
          return Promise.resolve(
            new Response(null, {
              status: 200,
              headers: {
                'content-length': '123',
                'content-type': 'image/jpeg',
              },
            }),
          );
        }
        return Promise.resolve(new Response(null, { status: 204 }));
      },
    ) as typeof fetch;
    const provider = new CloudflareR2GatewayStorageProvider({
      baseUrl: 'https://gateway.example',
      signingSecret,
      bucket,
      fetch: gatewayFetch,
    });

    await expect(provider.headObject(bucket, objectKey)).resolves.toEqual({
      exists: true,
      contentLength: 123,
      contentType: 'image/jpeg',
    });
    await provider.deleteObject(bucket, objectKey);
    await provider.putObject({
      bucket,
      objectKey,
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/jpeg',
    });

    expect(calls.map((call) => call.init.method)).toEqual([
      'HEAD',
      'DELETE',
      'PUT',
    ]);
    expect(calls[2]?.init.body).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls[2]?.init.headers).toEqual({ 'content-type': 'image/jpeg' });
    expect(calls.every((call) => call.url.origin === 'https://gateway.example')).toBe(true);
    expect(calls.every((call) => !call.url.toString().includes('r2.cloudflarestorage.com'))).toBe(true);
  });

  it('maps Worker HEAD 404 to a missing object', async () => {
    const provider = new CloudflareR2GatewayStorageProvider({
      baseUrl: 'https://gateway.example',
      signingSecret,
      bucket,
      fetch: () => Promise.resolve(new Response(null, { status: 404 })),
    });
    await expect(provider.headObject(bucket, objectKey)).resolves.toEqual({
      exists: false,
    });
  });
});

describe('storage transport selection', () => {
  function config(values: Record<string, unknown>): ConfigService {
    return {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => {
        if (values[key] === undefined) throw new Error(`Missing ${key}`);
        return values[key];
      }),
    } as unknown as ConfigService;
  }

  it('selects the Worker provider in worker mode', () => {
    expect(
      createStorageProvider(
        config({
          'storage.configured': true,
          'storage.transport': 'worker',
          'storage.gatewayBaseUrl': 'https://gateway.example',
          'storage.gatewaySigningSecret': signingSecret,
          'storage.bucket': bucket,
        }),
      ),
    ).toBeInstanceOf(CloudflareR2GatewayStorageProvider);
  });

  it('keeps the existing S3 provider as the fallback transport', () => {
    expect(
      createStorageProvider(
        config({
          'storage.configured': true,
          'storage.transport': 's3',
          'storage.endpoint': 'https://account.r2.cloudflarestorage.com',
          'storage.accessKeyId': 'access-key',
          'storage.secretAccessKey': 'secret-key',
        }),
      ),
    ).toBeInstanceOf(CloudflareR2StorageProvider);
  });
});
