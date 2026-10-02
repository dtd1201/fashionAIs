import { calculateGenerationCreditCost, type AssetAccessUrlResponse, type AssetView, type CreateGenerationRequest } from '@fashion-ais/types';

export interface TryOnSettings {
  prompt: string;
  resolution: '' | '1k' | '2k' | '4k';
  generationMode: '' | 'fast' | 'balanced' | 'quality';
  outputCount: 1 | 2 | 3 | 4;
}

export function canBootstrapStudioData(
  status: 'loading' | 'authenticated' | 'anonymous',
  organizationId: string | undefined,
): organizationId is string {
  return status === 'authenticated' && Boolean(organizationId);
}

export function canGenerate(person: AssetView | null, garment: AssetView | null): boolean {
  return Boolean(person && garment && person.status === 'READY' && garment.status === 'READY');
}

export function handleGenerationGate(): { allowed: true } {
  // Future credit checks belong here, at execution time rather than Studio entry.
  return { allowed: true };
}

export function estimatedTryOnCost(settings: TryOnSettings): number {
  return calculateGenerationCreditCost({
    type: 'VIRTUAL_TRY_ON',
    inputs: [],
    parameters: { num_images: settings.outputCount },
  });
}

export function buildTryOnRequest(person: AssetView, garment: AssetView, settings: TryOnSettings): CreateGenerationRequest {
  return {
    type: 'VIRTUAL_TRY_ON',
    inputs: [
      { assetId: person.id, role: 'PERSON' },
      { assetId: garment.id, role: 'GARMENT' },
    ],
    parameters: {
      ...(settings.prompt.trim() ? { prompt: settings.prompt.trim() } : {}),
      ...(settings.resolution ? { resolution: settings.resolution } : {}),
      ...(settings.generationMode ? { generation_mode: settings.generationMode } : {}),
      num_images: settings.outputCount,
    },
  };
}

export async function loadAssetAccessUrl(options: {
  organizationId: string;
  assetId: string;
  request<T>(path: string, init?: RequestInit): Promise<T>;
}): Promise<string> {
  const result = await options.request<AssetAccessUrlResponse>(
    `/organizations/${options.organizationId}/assets/${options.assetId}/access-url`,
    { method: 'POST' },
  );
  return result.url;
}
