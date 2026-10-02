import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  PresignedUploadRequest,
  PutObjectRequest,
  StorageProvider,
  StoredObjectMetadata,
} from './storage-provider.interface';

export class CloudflareR2StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(options: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
  }) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: options.endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async createPresignedUpload(
    request: PresignedUploadRequest,
  ): Promise<{ uploadUrl: string }> {
    const command = new PutObjectCommand({
      Bucket: request.bucket,
      Key: request.objectKey,
      ContentType: request.contentType,
      ContentLength: request.contentLength,
    });
    return {
      uploadUrl: await getSignedUrl(this.client, command, {
        expiresIn: request.expiresInSeconds,
      }),
    };
  }

  async headObject(
    bucket: string,
    objectKey: string,
  ): Promise<StoredObjectMetadata> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      return {
        exists: true,
        contentLength: result.ContentLength,
        contentType: result.ContentType,
      };
    } catch (error) {
      if (this.isNotFound(error)) return { exists: false };
      throw error;
    }
  }

  async createPresignedDownload(
    bucket: string,
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<{ downloadUrl: string }> {
    return {
      downloadUrl: await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
        { expiresIn: expiresInSeconds },
      ),
    };
  }

  async deleteObject(bucket: string, objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
    );
  }

  async putObject(request: PutObjectRequest): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: request.bucket,
        Key: request.objectKey,
        Body: request.body,
        ContentType: request.contentType,
        ContentLength: request.body.byteLength,
      }),
    );
  }

  private isNotFound(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const value = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return value.name === 'NotFound' || value.$metadata?.httpStatusCode === 404;
  }
}
