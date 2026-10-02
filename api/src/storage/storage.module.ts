import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudflareR2StorageProvider } from './cloudflare-r2-storage.provider';
import { CloudflareR2GatewayStorageProvider } from './cloudflare-r2-gateway-storage.provider';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from './storage-provider.interface';
import { UnavailableStorageProvider } from './unavailable-storage.provider';

export function createStorageProvider(config: ConfigService): StorageProvider {
  if (!config.get<boolean>('storage.configured')) {
    return new UnavailableStorageProvider();
  }
  if (config.get<string>('storage.transport') === 'worker') {
    return new CloudflareR2GatewayStorageProvider({
      baseUrl: config.getOrThrow<string>('storage.gatewayBaseUrl'),
      signingSecret: config.getOrThrow<string>(
        'storage.gatewaySigningSecret',
      ),
      bucket: config.getOrThrow<string>('storage.bucket'),
    });
  }
  return new CloudflareR2StorageProvider({
    endpoint: config.getOrThrow<string>('storage.endpoint'),
    accessKeyId: config.getOrThrow<string>('storage.accessKeyId'),
    secretAccessKey: config.getOrThrow<string>('storage.secretAccessKey'),
  });
}

@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: createStorageProvider,
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
