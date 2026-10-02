import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CreditsModule } from '../credits/credits.module';
import { AiGenerationProcessor } from './ai-generation.processor';
import { AiProviderResolver } from './ai-provider.resolver';
import { FashnAiProvider } from './fashn-ai.provider';
import { GeminiVirtualTryOnProvider } from './gemini-virtual-try-on.provider';
import { MockAiProvider } from './mock-ai.provider';
import { OpenAiVirtualTryOnProvider } from './openai-virtual-try-on.provider';

@Module({
  imports: [StorageModule, CreditsModule],
  providers: [
    MockAiProvider,
    FashnAiProvider,
    OpenAiVirtualTryOnProvider,
    GeminiVirtualTryOnProvider,
    AiProviderResolver,
    AiGenerationProcessor,
  ],
  exports: [AiGenerationProcessor, AiProviderResolver],
})
export class AiModule {}
