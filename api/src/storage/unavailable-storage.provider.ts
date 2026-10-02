import { InternalServerErrorException } from '@nestjs/common';
import type {
  StorageProvider,
  StoredObjectMetadata,
} from './storage-provider.interface';

export class UnavailableStorageProvider implements StorageProvider {
  createPresignedUpload(): Promise<{ uploadUrl: string }> {
    return Promise.reject(this.error());
  }

  headObject(): Promise<StoredObjectMetadata> {
    return Promise.reject(this.error());
  }

  createPresignedDownload(): Promise<{ downloadUrl: string }> {
    return Promise.reject(this.error());
  }

  deleteObject(): Promise<void> {
    return Promise.reject(this.error());
  }

  putObject(): Promise<void> {
    return Promise.reject(this.error());
  }

  private error(): InternalServerErrorException {
    return new InternalServerErrorException({
      code: 'ASSET_STORAGE_ERROR',
      message: 'Object storage is not configured',
    });
  }
}
