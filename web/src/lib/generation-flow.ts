import type {
  CancelGenerationResponse,
  CreateGenerationRequest,
  CreateGenerationResponse,
  GenerationDetail,
  SupportedGenerationType,
} from '@fashion-ais/types';

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export function buildGenerationRequest(input: {
  type: SupportedGenerationType;
  prompt: string;
  instruction: string;
  primaryAssetId?: string;
  secondaryAssetId?: string;
}): CreateGenerationRequest {
  if (input.type === 'IMAGE_GENERATION') {
    if (!input.prompt.trim()) throw new Error('Prompt is required');
    return {
      type: input.type,
      inputs: input.primaryAssetId
        ? [{ assetId: input.primaryAssetId, role: 'REFERENCE' }]
        : [],
      parameters: { prompt: input.prompt.trim() },
    };
  }
  if (input.type === 'VIRTUAL_TRY_ON') {
    if (!input.primaryAssetId || !input.secondaryAssetId)
      throw new Error('Person and garment assets are required');
    return {
      type: input.type,
      inputs: [
        { assetId: input.primaryAssetId, role: 'PERSON' },
        { assetId: input.secondaryAssetId, role: 'GARMENT' },
      ],
      parameters: {},
    };
  }
  if (!input.primaryAssetId) throw new Error('Source asset is required');
  if (!input.instruction.trim()) throw new Error('Editing instruction is required');
  return {
    type: input.type,
    inputs: [
      { assetId: input.primaryAssetId, role: 'SOURCE' },
      ...(input.secondaryAssetId
        ? [{ assetId: input.secondaryAssetId, role: 'MASK' as const }]
        : []),
    ],
    parameters: { instruction: input.instruction.trim() },
  };
}

export async function submitGeneration(options: {
  organizationId: string | null;
  input: CreateGenerationRequest;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  idempotencyKey?: string;
}): Promise<CreateGenerationResponse> {
  if (!options.organizationId)
    throw new Error('A current organization is required');
  return options.request(
    `/organizations/${options.organizationId}/generations`,
    {
      method: 'POST',
      headers: options.idempotencyKey
        ? { 'Idempotency-Key': options.idempotencyKey }
        : undefined,
      body: JSON.stringify(options.input),
    },
  );
}

export async function pollGeneration(options: {
  organizationId: string;
  generationId: string;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  wait?: () => Promise<void>;
  isActive?: () => boolean;
  onUpdate?(generation: GenerationDetail): void;
}): Promise<GenerationDetail | null> {
  const wait =
    options.wait ?? (() => new Promise((resolve) => setTimeout(resolve, 2000)));
  while (options.isActive?.() ?? true) {
    const generation = await options.request<GenerationDetail>(
      `/organizations/${options.organizationId}/generations/${options.generationId}`,
    );
    options.onUpdate?.(generation);
    if (TERMINAL.has(generation.status)) return generation;
    await wait();
  }
  return null;
}

export function cancelGeneration(
  organizationId: string,
  generationId: string,
  request: <T>(path: string, init?: RequestInit) => Promise<T>,
): Promise<CancelGenerationResponse> {
  return request(
    `/organizations/${organizationId}/generations/${generationId}/cancel`,
    {
      method: 'POST',
    },
  );
}
