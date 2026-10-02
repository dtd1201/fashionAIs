import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider.interface';
import { Inject } from '@nestjs/common';
import {
  AiProviderCancelledError,
  AiProviderPermanentError,
  AiProviderTransientError,
  type AiGeneratedArtifact,
  type AiGenerationContext,
  type AiGenerationResult,
  type AiProvider,
} from './ai-provider.interface';

type JsonObject = Record<string, unknown>;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

@Injectable()
export class FashnAiProvider implements AiProvider {
  readonly provider = 'FASHN' as const;

  constructor(
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  supports(type: AiGenerationContext['type']): boolean {
    return type === 'VIRTUAL_TRY_ON';
  }

  async generate(context: AiGenerationContext): Promise<AiGenerationResult> {
    if (!this.supports(context.type)) throw this.permanent('AI_PROVIDER_INVALID_REQUEST', 'FASHN only supports virtual try-on');
    const person = context.inputs.find((input) => input.role === 'PERSON');
    const garment = context.inputs.find((input) => input.role === 'GARMENT');
    if (!person || !garment) throw this.permanent('AI_PROVIDER_INVALID_REQUEST', 'Virtual try-on inputs are invalid');

    let predictionId = context.providerJobId;
    if (!predictionId) {
      const [modelImage, productImage] = await Promise.all([
        this.signedUrl(person.bucket, person.objectKey),
        this.signedUrl(garment.bucket, garment.objectKey),
      ]);
      const parameters = context.parameters as JsonObject;
      const inputs: JsonObject = { model_image: modelImage, product_image: productImage };
      for (const key of ['prompt', 'resolution', 'generation_mode', 'num_images']) {
        if (parameters[key] !== undefined) inputs[key] = parameters[key];
      }
      const response = await this.request('/run', {
        method: 'POST',
        body: JSON.stringify({ model_name: this.config.getOrThrow<string>('ai.fashn.modelName'), inputs }),
      });
      predictionId = this.stringField(response, 'id');
      if (!predictionId) throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN returned an invalid prediction response');
      await context.persistProviderJobId(predictionId);
    }

    const urls = await this.poll(predictionId, context);
    const outputs: AiGeneratedArtifact[] = [];
    for (const [index, url] of urls.entries()) outputs.push(await this.download(url, index));
    return { providerJobId: predictionId, outputs };
  }

  private async signedUrl(bucket: string, objectKey: string): Promise<string> {
    const result = await this.storage.createPresignedDownload(bucket, objectKey, 900);
    return result.downloadUrl;
  }

  private async poll(predictionId: string, context: AiGenerationContext): Promise<string[]> {
    const interval = this.config.getOrThrow<number>('ai.fashn.statusPollIntervalMs');
    const deadline = Date.now() + this.config.getOrThrow<number>('ai.fashn.statusTimeoutMs');
    while (Date.now() <= deadline) {
      if (await context.isCancellationRequested()) throw new AiProviderCancelledError();
      const response = await this.request(`/status/${encodeURIComponent(predictionId)}`, { method: 'GET' });
      const status = this.stringField(response, 'status')?.toLowerCase();
      if (status === 'completed') {
        const output = response.output;
        if (!Array.isArray(output) || output.length < 1 || output.length > 4 || output.some((url) => typeof url !== 'string')) {
          throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN returned invalid outputs');
        }
        return output as string[];
      }
      if (['failed', 'error', 'canceled', 'cancelled'].includes(status ?? '')) {
        throw this.permanent('AI_PROVIDER_GENERATION_FAILED', 'FASHN generation failed');
      }
      if (!['starting', 'in_queue', 'processing'].includes(status ?? '')) {
        throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN returned an invalid status');
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(interval, Math.max(0, deadline - Date.now()))));
    }
    throw new AiProviderTransientError('FASHN status polling timed out', 'AI_PROVIDER_TIMEOUT');
  }

  private async request(path: string, init: RequestInit): Promise<JsonObject> {
    const apiKey = this.config.getOrThrow<string>('ai.fashn.apiKey');
    if (!apiKey) throw this.permanent('AI_PROVIDER_AUTHENTICATION_FAILED', 'FASHN credentials are not configured');
    const response = await this.fetchWithTimeout(`${this.config.getOrThrow<string>('ai.fashn.baseUrl')}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      redirect: 'error',
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw this.permanent('AI_PROVIDER_AUTHENTICATION_FAILED', 'FASHN authentication failed');
      if (response.status === 429) throw new AiProviderTransientError('FASHN rate limit reached', 'AI_PROVIDER_RATE_LIMITED');
      if (response.status >= 500) throw new AiProviderTransientError('FASHN is unavailable', 'AI_PROVIDER_UNAVAILABLE');
      throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN rejected the request');
    }
    try {
      const value: unknown = await response.json();
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value as JsonObject;
    } catch {
      throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN returned invalid JSON');
    }
  }

  private async download(rawUrl: string, index: number): Promise<AiGeneratedArtifact> {
    const url = this.safeOutputUrl(rawUrl);
    const response = await this.fetchWithTimeout(url.toString(), { method: 'GET', redirect: 'error' });
    if (!response.ok) throw new AiProviderTransientError('FASHN output download failed', 'AI_PROVIDER_UNAVAILABLE');
    const mimeType = (response.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
    if (!mimeType || !IMAGE_TYPES.has(mimeType)) throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN output has an invalid content type');
    const limit = this.config.getOrThrow<number>('ai.fashn.maxOutputBytes');
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > limit) throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN output exceeds the size limit');
    if (!response.body) throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN output is empty');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) { await reader.cancel(); throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN output exceeds the size limit'); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    return { bytes, mimeType, fileName: `fashn-tryon-output-${index + 1}.${extension}` };
  }

  private safeOutputUrl(value: string): URL {
    let url: URL;
    try { url = new URL(value); } catch { throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN output URL is invalid'); }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || hostname === 'localhost' || hostname.endsWith('.localhost') || this.privateIp(hostname)) {
      throw this.permanent('AI_PROVIDER_INVALID_RESPONSE', 'FASHN output URL is not allowed');
    }
    return url;
  }

  private privateIp(host: string): boolean {
    if (!isIP(host)) return false;
    return /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(host);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.getOrThrow<number>('ai.fashn.requestTimeoutMs'));
    try { return await fetch(url, { ...init, signal: controller.signal }); }
    catch { throw new AiProviderTransientError('FASHN request timed out or failed', 'AI_PROVIDER_TIMEOUT'); }
    finally { clearTimeout(timer); }
  }

  private stringField(value: JsonObject, key: string): string | undefined {
    const field = value[key];
    return typeof field === 'string' && field.trim() ? field.trim() : undefined;
  }

  private permanent(code: string, message: string): AiProviderPermanentError {
    return new AiProviderPermanentError(message, code);
  }
}
