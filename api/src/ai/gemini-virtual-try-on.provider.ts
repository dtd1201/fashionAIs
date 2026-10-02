import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../storage/storage-provider.interface';
import {
  AiProviderCancelledError,
  AiProviderPermanentError,
  AiProviderTransientError,
  type AiGenerationContext,
  type AiGenerationResult,
  type AiProvider,
} from './ai-provider.interface';
import {
  buildVirtualTryOnPrompt,
  decodeProviderImage,
  fetchWithProviderTimeout,
  loadVirtualTryOnInputs,
  virtualTryOnOutputCount,
  type VirtualTryOnInputs,
} from './virtual-try-on.utils';

type JsonObject = Record<string, unknown>;

@Injectable()
export class GeminiVirtualTryOnProvider implements AiProvider {
  readonly provider = 'GEMINI' as const;

  constructor(
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  supports(type: AiGenerationContext['type']): boolean {
    return type === 'VIRTUAL_TRY_ON';
  }

  async generate(context: AiGenerationContext): Promise<AiGenerationResult> {
    const timeoutMs = this.config.getOrThrow<number>(
      'ai.gemini.requestTimeoutMs',
    );
    const inputs = await loadVirtualTryOnInputs(
      context,
      this.storage,
      timeoutMs,
    );
    const outputs = [];
    for (let index = 0; index < virtualTryOnOutputCount(context); index += 1) {
      if (await context.isCancellationRequested()) {
        throw new AiProviderCancelledError();
      }
      const image = await this.generateOne(context, inputs, timeoutMs);
      outputs.push({
        ...image,
        fileName: `gemini-tryon-output-${index + 1}.${image.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`,
      });
    }
    return { outputs };
  }

  private async generateOne(
    context: AiGenerationContext,
    inputs: VirtualTryOnInputs,
    timeoutMs: number,
  ): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const model = encodeURIComponent(
      this.config.getOrThrow<string>('ai.gemini.model'),
    );
    const response = await fetchWithProviderTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.config.getOrThrow<string>('ai.gemini.apiKey'),
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: buildVirtualTryOnPrompt(context) },
                {
                  inlineData: {
                    mimeType: inputs.person.mimeType,
                    data: Buffer.from(inputs.person.bytes).toString('base64'),
                  },
                },
                {
                  inlineData: {
                    mimeType: inputs.garment.mimeType,
                    data: Buffer.from(inputs.garment.bytes).toString('base64'),
                  },
                },
              ],
            },
          ],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      },
      timeoutMs,
      'Gemini',
    );
    if (!response.ok) this.throwHttpError(response.status);
    const body = await this.safeJson(response);
    const image = this.findImagePart(body);
    if (!image) throw this.invalidResponse();
    return {
      bytes: decodeProviderImage(image.data, 'Gemini'),
      mimeType: image.mimeType,
    };
  }

  private findImagePart(
    value: JsonObject,
  ): { data: string; mimeType: 'image/png' | 'image/jpeg' } | undefined {
    const candidates = value.candidates;
    if (!Array.isArray(candidates)) return undefined;
    for (const candidate of candidates) {
      if (!this.isObject(candidate) || !this.isObject(candidate.content)) continue;
      const parts = candidate.content.parts;
      if (!Array.isArray(parts)) continue;
      for (const part of parts) {
        if (!this.isObject(part)) continue;
        const inline = this.isObject(part.inlineData)
          ? part.inlineData
          : this.isObject(part.inline_data)
            ? part.inline_data
            : undefined;
        if (!inline) continue;
        const data = inline.data;
        const mimeType = inline.mimeType ?? inline.mime_type;
        if (
          typeof data === 'string' &&
          (mimeType === 'image/png' || mimeType === 'image/jpeg')
        ) {
          return { data, mimeType };
        }
      }
    }
    return undefined;
  }

  private throwHttpError(status: number): never {
    if (status === 401 || status === 403) {
      throw new AiProviderPermanentError(
        'Gemini authentication failed',
        'AI_PROVIDER_AUTHENTICATION_FAILED',
      );
    }
    if (status === 429) {
      throw new AiProviderTransientError(
        'Gemini rate limit reached',
        'AI_PROVIDER_RATE_LIMITED',
      );
    }
    if (status >= 500) {
      throw new AiProviderTransientError(
        'Gemini is unavailable',
        'AI_PROVIDER_UNAVAILABLE',
      );
    }
    throw new AiProviderPermanentError(
      'Gemini rejected the image request',
      'AI_PROVIDER_GENERATION_FAILED',
    );
  }

  private async safeJson(response: Response): Promise<JsonObject> {
    try {
      const value: unknown = await response.json();
      if (!this.isObject(value)) throw new Error();
      return value;
    } catch {
      throw this.invalidResponse();
    }
  }

  private isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private invalidResponse(): AiProviderPermanentError {
    return new AiProviderPermanentError(
      'Gemini returned an invalid image response',
      'AI_PROVIDER_INVALID_RESPONSE',
    );
  }
}
