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
  imageBlob,
  loadVirtualTryOnInputs,
  virtualTryOnOutputCount,
} from './virtual-try-on.utils';

interface OpenAiImageResponse {
  data?: Array<{ b64_json?: string }>;
}

@Injectable()
export class OpenAiVirtualTryOnProvider implements AiProvider {
  readonly provider = 'OPENAI' as const;

  constructor(
    private readonly config: ConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  supports(type: AiGenerationContext['type']): boolean {
    return type === 'VIRTUAL_TRY_ON';
  }

  async generate(context: AiGenerationContext): Promise<AiGenerationResult> {
    const timeoutMs = this.config.getOrThrow<number>(
      'ai.openai.requestTimeoutMs',
    );
    const inputs = await loadVirtualTryOnInputs(
      context,
      this.storage,
      timeoutMs,
    );
    const count = virtualTryOnOutputCount(context);
    const form = new FormData();
    form.set('model', this.config.getOrThrow<string>('ai.openai.model'));
    form.set('prompt', buildVirtualTryOnPrompt(context));
    form.set('quality', this.config.getOrThrow<string>('ai.openai.quality'));
    form.set('size', this.config.getOrThrow<string>('ai.openai.size'));
    form.set('n', String(count));
    form.set('output_format', 'png');
    form.append('image[]', imageBlob(inputs.person), 'person-reference.png');
    form.append('image[]', imageBlob(inputs.garment), 'garment-reference.png');

    const apiKey = this.config.getOrThrow<string>('ai.openai.apiKey');
    const response = await fetchWithProviderTimeout(
      'https://api.openai.com/v1/images/edits',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}` },
        body: form,
      },
      timeoutMs,
      'OpenAI',
    );
    if (!response.ok) this.throwHttpError(response.status);
    const body = (await this.safeJson(response)) as OpenAiImageResponse;
    if (!Array.isArray(body.data) || body.data.length < count) {
      throw this.invalidResponse();
    }
    if (await context.isCancellationRequested()) {
      throw new AiProviderCancelledError();
    }
    return {
      outputs: body.data.slice(0, count).map((image, index) => {
        if (typeof image.b64_json !== 'string') throw this.invalidResponse();
        return {
          bytes: decodeProviderImage(image.b64_json, 'OpenAI'),
          mimeType: 'image/png',
          fileName: `openai-tryon-output-${index + 1}.png`,
        };
      }),
    };
  }

  private throwHttpError(status: number): never {
    if (status === 401 || status === 403) {
      throw new AiProviderPermanentError(
        'OpenAI authentication failed',
        'AI_PROVIDER_AUTHENTICATION_FAILED',
      );
    }
    if (status === 429) {
      throw new AiProviderTransientError(
        'OpenAI rate limit reached',
        'AI_PROVIDER_RATE_LIMITED',
      );
    }
    if (status >= 500) {
      throw new AiProviderTransientError(
        'OpenAI is unavailable',
        'AI_PROVIDER_UNAVAILABLE',
      );
    }
    throw new AiProviderPermanentError(
      'OpenAI rejected the image request',
      'AI_PROVIDER_GENERATION_FAILED',
    );
  }

  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      throw this.invalidResponse();
    }
  }

  private invalidResponse(): AiProviderPermanentError {
    return new AiProviderPermanentError(
      'OpenAI returned an invalid image response',
      'AI_PROVIDER_INVALID_RESPONSE',
    );
  }
}
