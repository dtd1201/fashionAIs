import type { StorageProvider } from '../storage/storage-provider.interface';
import {
  AiProviderCancelledError,
  AiProviderPermanentError,
  AiProviderTransientError,
  type AiGenerationContext,
} from './ai-provider.interface';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export interface VirtualTryOnImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface VirtualTryOnInputs {
  person: VirtualTryOnImage;
  garment: VirtualTryOnImage;
}

export function virtualTryOnOutputCount(context: AiGenerationContext): number {
  const value = (context.parameters as Record<string, unknown>).num_images;
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4
    ? value
    : 1;
}

export function buildVirtualTryOnPrompt(context: AiGenerationContext): string {
  const userPrompt = (context.parameters as Record<string, unknown>).prompt;
  const base =
    'Use the first image (person/reference model) as the identity, pose, body-proportion, lighting, environment, and scene source. Use the second image (garment reference) only as the clothing source. Dress the person in the referenced garment while preserving the person\'s facial identity, body proportions, pose, lighting, and background as closely as possible. Preserve the garment\'s exact design, silhouette, color, materials, texture, prints, logos, and construction details. Produce one photorealistic commercial fashion image. Do not merge the two source scenes and do not copy any person or model from the garment reference.';
  return typeof userPrompt === 'string' && userPrompt.trim()
    ? `${base}\nAdditional styling guidance, subordinate to the instructions above: ${userPrompt.trim()}`
    : base;
}

export async function loadVirtualTryOnInputs(
  context: AiGenerationContext,
  storage: StorageProvider,
  timeoutMs: number,
): Promise<VirtualTryOnInputs> {
  if (context.type !== 'VIRTUAL_TRY_ON') {
    throw new AiProviderPermanentError(
      'Provider only supports virtual try-on',
      'AI_PROVIDER_INVALID_REQUEST',
    );
  }
  const person = context.inputs.find((input) => input.role === 'PERSON');
  const garment = context.inputs.find((input) => input.role === 'GARMENT');
  if (!person || !garment) {
    throw new AiProviderPermanentError(
      'Virtual try-on inputs are invalid',
      'AI_PROVIDER_INVALID_REQUEST',
    );
  }
  if (await context.isCancellationRequested()) {
    throw new AiProviderCancelledError();
  }
  const [personImage, garmentImage] = await Promise.all([
    loadImage(person.bucket, person.objectKey, storage, timeoutMs),
    loadImage(garment.bucket, garment.objectKey, storage, timeoutMs),
  ]);
  return { person: personImage, garment: garmentImage };
}

export async function fetchWithProviderTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  providerName: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new AiProviderTransientError(
      `${providerName} request timed out or failed`,
      'AI_PROVIDER_TIMEOUT',
    );
  } finally {
    clearTimeout(timer);
  }
}

export function decodeProviderImage(
  value: string,
  providerName: string,
): Uint8Array {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new AiProviderPermanentError(
      `${providerName} returned invalid image data`,
      'AI_PROVIDER_INVALID_RESPONSE',
    );
  }
  const bytes = new Uint8Array(Buffer.from(value, 'base64'));
  if (bytes.byteLength === 0 || bytes.byteLength > 30 * 1024 * 1024) {
    throw new AiProviderPermanentError(
      `${providerName} returned invalid image data`,
      'AI_PROVIDER_INVALID_RESPONSE',
    );
  }
  return bytes;
}

async function loadImage(
  bucket: string,
  objectKey: string,
  storage: StorageProvider,
  timeoutMs: number,
): Promise<VirtualTryOnImage> {
  const { downloadUrl } = await storage.createPresignedDownload(
    bucket,
    objectKey,
    300,
  );
  const response = await fetchWithProviderTimeout(
    downloadUrl,
    { method: 'GET', redirect: 'error' },
    timeoutMs,
    'Input storage',
  );
  if (!response.ok) {
    throw new AiProviderTransientError(
      'Input image download failed',
      'AI_PROVIDER_UNAVAILABLE',
    );
  }
  const mimeType = (response.headers.get('content-type') ?? '')
    .split(';', 1)[0]
    ?.trim()
    .toLowerCase();
  if (!mimeType || !IMAGE_TYPES.has(mimeType)) {
    throw new AiProviderPermanentError(
      'Input image has an invalid content type',
      'AI_PROVIDER_INVALID_REQUEST',
    );
  }
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_INPUT_BYTES) {
    throw new AiProviderPermanentError(
      'Input image exceeds the provider size limit',
      'AI_PROVIDER_INVALID_REQUEST',
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_INPUT_BYTES) {
    throw new AiProviderPermanentError(
      'Input image exceeds the provider size limit',
      'AI_PROVIDER_INVALID_REQUEST',
    );
  }
  return { bytes, mimeType };
}

export function imageBlob(image: VirtualTryOnImage): Blob {
  return new Blob([Uint8Array.from(image.bytes).buffer], {
    type: image.mimeType,
  });
}
