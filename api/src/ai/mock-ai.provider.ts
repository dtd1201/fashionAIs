import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiProviderCancelledError,
  AiProviderPermanentError,
  AiProviderTransientError,
  type AiGenerationContext,
  type AiGenerationResult,
  type AiProvider,
} from './ai-provider.interface';

@Injectable()
export class MockAiProvider implements AiProvider {
  readonly provider = 'MOCK' as const;
  constructor(private readonly config: ConfigService) {}

  supports(type: AiGenerationContext['type']): boolean {
    return ['IMAGE_GENERATION', 'VIRTUAL_TRY_ON', 'IMAGE_EDITING'].includes(type);
  }

  async generate(context: AiGenerationContext): Promise<AiGenerationResult> {
    if (await context.isCancellationRequested())
      throw new AiProviderCancelledError();
    const mockBehavior = (context.parameters as unknown as Record<string, unknown>).mockBehavior;
    if (mockBehavior === 'permanent-failure') {
      throw new AiProviderPermanentError('Mock permanent failure');
    }
    if (mockBehavior === 'transient-failure') {
      throw new AiProviderTransientError('Mock transient failure');
    }
    const delay = this.config.get<number>('ai.mockDelayMs') ?? 100;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    if (await context.isCancellationRequested())
      throw new AiProviderCancelledError();
    return {
      providerJobId: `mock-${context.generationId}`,
      outputs: [
        {
          bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
          mimeType: 'image/png',
          fileName: 'mock-output.png',
        },
      ],
    };
  }
}
