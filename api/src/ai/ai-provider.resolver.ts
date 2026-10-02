import { Injectable } from '@nestjs/common';
import type { AIProviderName, GenerationType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AiProviderUnavailableError, type AiProvider } from './ai-provider.interface';
import { FashnAiProvider } from './fashn-ai.provider';
import { GeminiVirtualTryOnProvider } from './gemini-virtual-try-on.provider';
import { MockAiProvider } from './mock-ai.provider';
import { OpenAiVirtualTryOnProvider } from './openai-virtual-try-on.provider';

@Injectable()
export class AiProviderResolver {
  private readonly providers: Map<AIProviderName, AiProvider>;

  constructor(
    private readonly config: ConfigService,
    mock: MockAiProvider,
    fashn: FashnAiProvider,
    openai: OpenAiVirtualTryOnProvider,
    gemini: GeminiVirtualTryOnProvider,
  ) {
    this.providers = new Map<AIProviderName, AiProvider>([
      [mock.provider, mock],
      [fashn.provider, fashn],
      [openai.provider, openai],
      [gemini.provider, gemini],
    ]);
  }

  providerForType(type: GenerationType): AIProviderName {
    const key =
      type === 'IMAGE_GENERATION'
        ? 'ai.providers.imageGeneration'
        : type === 'VIRTUAL_TRY_ON'
          ? 'ai.providers.virtualTryOn'
          : type === 'IMAGE_EDITING'
            ? 'ai.providers.imageEditing'
            : undefined;
    if (!key) throw new AiProviderUnavailableError('Generation type is not supported');
    return this.toProviderName(this.config.getOrThrow<string>(key));
  }

  resolve(providerName: AIProviderName, type: GenerationType): AiProvider {
    const provider = this.providers.get(providerName);
    if (!provider || !provider.supports(type)) {
      throw new AiProviderUnavailableError('Configured AI provider is unavailable');
    }
    return provider;
  }

  private toProviderName(value: string): AIProviderName {
    if (value.toLowerCase() === 'mock') return 'MOCK';
    if (value.toLowerCase() === 'fashn') return 'FASHN';
    if (value.toLowerCase() === 'openai') return 'OPENAI';
    if (value.toLowerCase() === 'gemini') return 'GEMINI';
    throw new AiProviderUnavailableError('Configured AI provider is unavailable');
  }
}
