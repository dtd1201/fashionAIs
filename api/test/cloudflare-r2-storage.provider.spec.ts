import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { CloudflareR2StorageProvider } from '../src/storage/cloudflare-r2-storage.provider';

const endpoint = 'https://account-id.r2.cloudflarestorage.com';
const bucket = 'fashionais-assets';
const accessKeyId = 'test-access-key';
const secretAccessKey = 'test-secret-key';

function createProvider(): CloudflareR2StorageProvider {
  return new CloudflareR2StorageProvider({
    endpoint,
    accessKeyId,
    secretAccessKey,
  });
}

describe('CloudflareR2StorageProvider', () => {
  it('signs PUT uploads with the bucket in the path rather than the hostname', async () => {
    const result = await createProvider().createPresignedUpload({
      bucket,
      objectKey: 'organizations/org-id/assets/image.jpg',
      contentType: 'image/jpeg',
      contentLength: 123,
      expiresInSeconds: 900,
    });
    const url = new URL(result.uploadUrl);

    expect(url.hostname).toBe('account-id.r2.cloudflarestorage.com');
    expect(url.hostname).not.toContain(bucket);
    expect(url.pathname).toBe(
      '/fashionais-assets/organizations/org-id/assets/image.jpg',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(result.uploadUrl).not.toContain(secretAccessKey);
    expect(url.searchParams.get('X-Amz-Credential')).toContain(accessKeyId);
  });

  it('signs GET downloads with the same path-style addressing', async () => {
    const result = await createProvider().createPresignedDownload(
      bucket,
      'organizations/org-id/assets/result.png',
      300,
    );
    const url = new URL(result.downloadUrl);

    expect(url.hostname).toBe('account-id.r2.cloudflarestorage.com');
    expect(url.hostname).not.toContain(bucket);
    expect(url.pathname).toBe(
      '/fashionais-assets/organizations/org-id/assets/result.png',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(result.downloadUrl).not.toContain(secretAccessKey);
    expect(url.searchParams.get('X-Amz-Credential')).toContain(accessKeyId);
  });

  it('preserves HEAD, delete, and put object command behavior', async () => {
    const provider = createProvider();
    const commands: unknown[] = [];
    let callCount = 0;
    const send = jest.fn((command: unknown): Promise<unknown> => {
      commands.push(command);
      callCount += 1;
      return Promise.resolve(
        callCount === 1
          ? { ContentLength: 123, ContentType: 'image/jpeg' }
          : {},
      );
    });
    const client = provider as unknown as {
      client: { send: typeof send };
    };
    client.client.send = send;

    await expect(
      provider.headObject(bucket, 'path/image.jpg'),
    ).resolves.toEqual({
      exists: true,
      contentLength: 123,
      contentType: 'image/jpeg',
    });
    await provider.deleteObject(bucket, 'path/image.jpg');
    await provider.putObject({
      bucket,
      objectKey: 'path/generated.jpg',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/jpeg',
    });

    const headCommand = commands[0];
    const deleteCommand = commands[1];
    const putCommand = commands[2];
    expect(headCommand).toBeInstanceOf(HeadObjectCommand);
    expect(deleteCommand).toBeInstanceOf(DeleteObjectCommand);
    expect(putCommand).toBeInstanceOf(PutObjectCommand);
    if (!(headCommand instanceof HeadObjectCommand)) throw new Error('Expected HEAD command');
    if (!(deleteCommand instanceof DeleteObjectCommand)) throw new Error('Expected delete command');
    if (!(putCommand instanceof PutObjectCommand)) throw new Error('Expected put command');
    expect(headCommand.input).toEqual({
      Bucket: bucket,
      Key: 'path/image.jpg',
    });
    expect(deleteCommand.input).toEqual({
      Bucket: bucket,
      Key: 'path/image.jpg',
    });
    expect(putCommand.input).toEqual({
      Bucket: bucket,
      Key: 'path/generated.jpg',
      Body: new Uint8Array([1, 2, 3]),
      ContentType: 'image/jpeg',
      ContentLength: 3,
    });
  });

  it('maps a missing HEAD object without changing storage behavior', async () => {
    const provider = createProvider();
    const client = provider as unknown as {
      client: { send: jest.Mock };
    };
    client.client.send = jest.fn().mockRejectedValue({
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
    });

    await expect(provider.headObject(bucket, 'missing.jpg')).resolves.toEqual({
      exists: false,
    });
  });
});
