import type { AIProviderName, GenerationAssetRole, GenerationType } from '@prisma/client';
import type { GenerationParameters } from '@fashion-ais/types';

export interface AiGenerationContext {
  generationId: string;
  organizationId: string;
  type: GenerationType;
  parameters: GenerationParameters;
  inputs: Array<{
    assetId: string;
    role: GenerationAssetRole;
    mimeType: string;
    bucket: string;
    objectKey: string;
  }>;
  providerJobId?: string;
  persistProviderJobId(providerJobId: string): Promise<void>;
  isCancellationRequested(): Promise<boolean>;
}

export interface AiGeneratedArtifact {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
}

export interface AiGenerationResult {
  providerJobId?: string;
  outputs: AiGeneratedArtifact[];
}

export interface AiProvider {
  readonly provider: AIProviderName;
  supports(type: GenerationType): boolean;
  generate(context: AiGenerationContext): Promise<AiGenerationResult>;
  cancel?(providerJobId: string): Promise<void>;
}

export class AiProviderTransientError extends Error {
  constructor(message: string, readonly code = 'AI_PROVIDER_TRANSIENT_ERROR') { super(message); }
}
export class AiProviderPermanentError extends Error {
  constructor(message: string, readonly code = 'AI_PROVIDER_PERMANENT_ERROR') { super(message); }
}
export class AiProviderUnavailableError extends AiProviderPermanentError {}
export class AiProviderCancelledError extends Error {}
