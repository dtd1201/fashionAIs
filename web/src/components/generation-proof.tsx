'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  AssetListResponse,
  AssetView,
  GenerationDetail,
  SupportedGenerationType,
} from '@fashion-ais/types';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  cancelGeneration,
  buildGenerationRequest,
  pollGeneration,
  submitGeneration,
} from '@/lib/generation-flow';

export function GenerationProof() {
  const { currentOrganization, request } = useAuth();
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [primaryAssetId, setPrimaryAssetId] = useState('');
  const [secondaryAssetId, setSecondaryAssetId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [instruction, setInstruction] = useState('');
  const [type, setType] = useState<SupportedGenerationType>('IMAGE_GENERATION');
  const [generation, setGeneration] = useState<GenerationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    if (currentOrganization) {
      void request<AssetListResponse>(
        `/organizations/${currentOrganization.id}/assets?status=READY&limit=100`,
      )
        .then((result) => {
          if (active.current) setAssets(result.items);
        })
        .catch(() => {
          if (active.current) setError('Unable to load ready assets');
        });
    }
    return () => {
      active.current = false;
    };
  }, [currentOrganization, request]);

  async function submit(): Promise<void> {
    if (!currentOrganization) return;
    setError(null);
    try {
      const created = await submitGeneration({
        organizationId: currentOrganization.id,
        input: buildGenerationRequest({
          type,
          prompt,
          instruction,
          primaryAssetId: primaryAssetId || undefined,
          secondaryAssetId: secondaryAssetId || undefined,
        }),
        request,
        idempotencyKey: crypto.randomUUID(),
      });
      await pollGeneration({
        organizationId: currentOrganization.id,
        generationId: created.generation.id,
        request,
        isActive: () => active.current,
        onUpdate: setGeneration,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Generation failed');
    }
  }

  async function cancel(): Promise<void> {
    if (!currentOrganization || !generation) return;
    const result = await cancelGeneration(
      currentOrganization.id,
      generation.id,
      request,
    );
    setGeneration((current) =>
      current ? { ...current, ...result.generation, job: result.job } : current,
    );
  }

  const cancellable =
    generation &&
    ['QUEUED', 'PROCESSING', 'CANCEL_REQUESTED'].includes(generation.status);
  return (
    <section className="mt-10 border-t border-stone-300 pt-8">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-amber-700">
        Generation test
      </p>
      <h2 className="mt-2 font-serif text-2xl font-bold">
        Mock background generation
      </h2>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value as SupportedGenerationType);
            setPrimaryAssetId('');
            setSecondaryAssetId('');
          }}
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          {[
            'VIRTUAL_TRY_ON',
            'IMAGE_GENERATION',
            'IMAGE_EDITING',
          ].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          value={primaryAssetId}
          onChange={(event) => setPrimaryAssetId(event.target.value)}
          className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">
            {type === 'VIRTUAL_TRY_ON' ? 'Choose person asset' : type === 'IMAGE_EDITING' ? 'Choose source asset' : 'Optional reference asset'}
          </option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.originalFileName}
            </option>
          ))}
        </select>
        {type !== 'IMAGE_GENERATION' && (
          <select
            value={secondaryAssetId}
            onChange={(event) => setSecondaryAssetId(event.target.value)}
            className="rounded border border-stone-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">{type === 'VIRTUAL_TRY_ON' ? 'Choose garment asset' : 'Optional mask asset'}</option>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalFileName}</option>)}
          </select>
        )}
        {type === 'IMAGE_GENERATION' && (
          <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the fashion image" className="rounded border border-stone-300 bg-white px-3 py-2 text-sm" />
        )}
        {type === 'IMAGE_EDITING' && (
          <input value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Describe the edit" className="rounded border border-stone-300 bg-white px-3 py-2 text-sm" />
        )}
        <Button
          disabled={Boolean(cancellable)}
          onClick={() => void submit()}
        >
          Generate
        </Button>
        {cancellable && <Button onClick={() => void cancel()}>Cancel</Button>}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {generation && (
        <div className="mt-5 text-sm text-stone-700">
          <p>Generation: {generation.id}</p>
          <p>Status: {generation.status}</p>
          {generation.inputs.map((input) => (
            <p key={input.id}>Input ({input.role}): {input.asset.originalFileName} ({input.asset.status})</p>
          ))}
          {generation.outputs.map((output) => (
            <p key={output.id}>
              Output: {output.asset.originalFileName} ({output.asset.status})
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
