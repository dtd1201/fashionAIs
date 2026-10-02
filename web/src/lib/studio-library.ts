import type { AssetView, GenerationDetail } from '@fashion-ais/types';
import type { TryOnSettings } from './studio-flow';

export type StudioRole = 'PERSON' | 'GARMENT';

export function selectExistingAsset(
  role: StudioRole,
  asset: AssetView,
  update: (role: StudioRole, asset: AssetView) => void,
): void {
  update(role, asset);
}

export function readStudioReuse(
  search: string,
  assets: AssetView[],
): { person: AssetView | null; garment: AssetView | null; prompt: string } {
  const params = new URLSearchParams(search);
  const ready = new Map(
    assets.filter((asset) => asset.status === 'READY').map((asset) => [asset.id, asset]),
  );
  return {
    person: ready.get(params.get('person') ?? '') ?? null,
    garment: ready.get(params.get('garment') ?? '') ?? null,
    prompt: (params.get('prompt') ?? '').slice(0, 500),
  };
}

export function applyStudioReuse(
  search: string,
  assets: AssetView[],
  current: TryOnSettings,
): { person: AssetView | null; garment: AssetView | null; settings: TryOnSettings } {
  const reuse = readStudioReuse(search, assets);
  return {
    person: reuse.person,
    garment: reuse.garment,
    settings: { ...current, prompt: reuse.prompt || current.prompt },
  };
}

export function buildUseAgainUrl(generation: GenerationDetail): string {
  const person = generation.inputs.find((input) => input.role === 'PERSON')?.asset.id;
  const garment = generation.inputs.find((input) => input.role === 'GARMENT')?.asset.id;
  const prompt = 'prompt' in generation.parameters ? generation.parameters.prompt : undefined;
  const params = new URLSearchParams();
  if (person) params.set('person', person);
  if (garment) params.set('garment', garment);
  if (prompt) params.set('prompt', prompt);
  const query = params.toString();
  return `/studio${query ? `?${query}` : ''}`;
}
