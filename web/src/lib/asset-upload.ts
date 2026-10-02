import type {
  AssetView,
  CompleteAssetResponse,
  CreateAssetUploadRequest,
  CreateAssetUploadResponse,
} from '@fashion-ais/types';

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'application/pdf',
]);

export class AssetUploadFlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

export function createAssetUploadInput(file: File): CreateAssetUploadRequest {
  if (!SUPPORTED_MIME_TYPES.has(file.type)) {
    throw new AssetUploadFlowError(
      'Choose a JPEG, PNG, WebP, MP4, WebM, or PDF file.',
      'ASSET_INVALID_FILE_TYPE',
    );
  }
  if (file.size <= 0) {
    throw new AssetUploadFlowError(
      'The selected file is empty.',
      'ASSET_INVALID_FILE_SIZE',
    );
  }
  return { fileName: file.name, mimeType: file.type, fileSize: file.size };
}

export async function uploadAssetFile(options: {
  organizationId: string | null;
  file: File;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  directUpload?: typeof fetch;
}): Promise<AssetView> {
  if (!options.organizationId) {
    throw new AssetUploadFlowError(
      'A current organization is required before uploading.',
      'ORGANIZATION_REQUIRED',
    );
  }
  const input = createAssetUploadInput(options.file);
  const basePath = `/organizations/${options.organizationId}/assets`;
  const initialized = await options.request<CreateAssetUploadResponse>(
    `${basePath}/uploads`,
    { method: 'POST', body: JSON.stringify(input) },
  );

  try {
    const response = await (options.directUpload ?? fetch)(
      initialized.upload.url,
      {
        method: initialized.upload.method,
        headers: initialized.upload.headers,
        body: options.file,
      },
    );
    if (!response.ok) {
      throw new AssetUploadFlowError(
        'Object storage upload failed.',
        'ASSET_STORAGE_ERROR',
      );
    }
  } catch (error) {
    try {
      await options.request<AssetView>(
        `${basePath}/${initialized.asset.id}/fail`,
        {
          method: 'POST',
        },
      );
    } catch {
      // The original direct-upload failure is more useful to the user.
    }
    throw error;
  }

  const completed = await options.request<CompleteAssetResponse>(
    `${basePath}/${initialized.asset.id}/complete`,
    { method: 'POST' },
  );
  return completed.asset;
}
