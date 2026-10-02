export interface PresignedUploadRequest {
  bucket: string;
  objectKey: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
}

export interface StoredObjectMetadata {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
}

export interface PutObjectRequest {
  bucket: string;
  objectKey: string;
  body: Uint8Array;
  contentType: string;
}

export interface StorageProvider {
  createPresignedUpload(
    request: PresignedUploadRequest,
  ): Promise<{ uploadUrl: string }>;
  headObject(bucket: string, objectKey: string): Promise<StoredObjectMetadata>;
  createPresignedDownload(
    bucket: string,
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<{ downloadUrl: string }>;
  deleteObject(bucket: string, objectKey: string): Promise<void>;
  putObject(request: PutObjectRequest): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
