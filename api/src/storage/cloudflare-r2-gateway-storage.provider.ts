import type {
  PresignedUploadRequest,
  PutObjectRequest,
  StorageProvider,
  StoredObjectMetadata,
} from './storage-provider.interface';
import { R2GatewaySigner } from './r2-gateway-signer';

const SERVER_REQUEST_EXPIRES_IN_SECONDS = 60;

export class CloudflareR2GatewayStorageProvider implements StorageProvider {
  private readonly signer: R2GatewaySigner;

  constructor(
    private readonly options: {
      baseUrl: string;
      signingSecret: string;
      bucket: string;
      fetch?: typeof fetch;
    },
  ) {
    this.signer = new R2GatewaySigner(
      options.baseUrl,
      options.signingSecret,
    );
  }

  createPresignedUpload(
    request: PresignedUploadRequest,
  ): Promise<{ uploadUrl: string }> {
    this.requireBucket(request.bucket);
    return Promise.resolve({
      uploadUrl: this.signer.createSignedUrl({
        method: 'PUT',
        objectKey: request.objectKey,
        expiresInSeconds: request.expiresInSeconds,
        contentType: request.contentType,
        maxBytes: request.contentLength,
      }),
    });
  }

  async headObject(
    bucket: string,
    objectKey: string,
  ): Promise<StoredObjectMetadata> {
    this.requireBucket(bucket);
    const response = await this.request('HEAD', objectKey);
    if (response.status === 404) return { exists: false };
    if (!response.ok) throw new Error('R2 gateway HEAD failed');
    const contentLength = this.optionalNumber(
      response.headers.get('content-length'),
    );
    return {
      exists: true,
      ...(contentLength === undefined ? {} : { contentLength }),
      ...(response.headers.get('content-type')
        ? { contentType: response.headers.get('content-type') ?? undefined }
        : {}),
    };
  }

  createPresignedDownload(
    bucket: string,
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<{ downloadUrl: string }> {
    this.requireBucket(bucket);
    return Promise.resolve({
      downloadUrl: this.signer.createSignedUrl({
        method: 'GET',
        objectKey,
        expiresInSeconds,
      }),
    });
  }

  async deleteObject(bucket: string, objectKey: string): Promise<void> {
    this.requireBucket(bucket);
    const response = await this.request('DELETE', objectKey);
    if (!response.ok) throw new Error('R2 gateway delete failed');
  }

  async putObject(request: PutObjectRequest): Promise<void> {
    this.requireBucket(request.bucket);
    const response = await this.request('PUT', request.objectKey, {
      body: request.body,
      contentType: request.contentType,
      maxBytes: request.body.byteLength,
    });
    if (!response.ok) throw new Error('R2 gateway put failed');
  }

  private request(
    method: 'PUT' | 'HEAD' | 'DELETE',
    objectKey: string,
    options: {
      body?: Uint8Array;
      contentType?: string;
      maxBytes?: number;
    } = {},
  ): Promise<Response> {
    const url = this.signer.createSignedUrl({
      method,
      objectKey,
      expiresInSeconds: SERVER_REQUEST_EXPIRES_IN_SECONDS,
      contentType: options.contentType,
      maxBytes: options.maxBytes,
    });
    return (this.options.fetch ?? fetch)(url, {
      method,
      headers: options.contentType
        ? { 'content-type': options.contentType }
        : undefined,
      body: options.body as BodyInit | undefined,
    });
  }

  private requireBucket(bucket: string): void {
    if (bucket !== this.options.bucket) {
      throw new Error('R2 gateway bucket mismatch');
    }
  }

  private optionalNumber(value: string | null): number | undefined {
    if (value === null || value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
