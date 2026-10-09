/* eslint-disable @next/next/no-img-element -- Asset URLs are short-lived signed URLs with dynamic hosts. */
'use client';

import type { AssetView, GenerationDetail } from '@fashion-ais/types';
import {
  AlertCircle,
  Clock3,
  ImageIcon,
  LoaderCircle,
  Plus,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { TryOnSettings } from '@/lib/studio-flow';
import { assetDisplayName } from '@/lib/presentation';

export function AssetSlot({
  label,
  asset,
  imageUrl,
  uploadState,
  onFile,
  onRemove,
}: {
  label: string;
  asset: AssetView | null;
  imageUrl?: string;
  uploadState: string;
  onFile(event: ChangeEvent<HTMLInputElement>): void;
  onRemove(): void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="studio-label">{label}</span>
        {asset && (
          <span className="text-[9px] font-bold uppercase tracking-[.1em] text-emerald-700">
            Selected
          </span>
        )}
      </div>
      <div
        className={`group relative aspect-[16/10] overflow-hidden rounded-lg bg-[#e7e1d6] text-center transition ${asset ? 'border-2 border-stone-900' : 'border border-dashed border-stone-400 hover:border-stone-700'}`}
      >
        {imageUrl ? (
          <>
            <img
              src={imageUrl}
              alt={asset?.originalFileName ?? label}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 flex translate-y-full gap-2 bg-stone-950/90 p-2 transition group-focus-within:translate-y-0 group-hover:translate-y-0 max-lg:translate-y-0">
              <label className="flex-1 cursor-pointer rounded-md bg-white py-1.5 text-[10px] font-bold">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={onFile}
                  className="sr-only"
                />
                Replace
              </label>
              <button
                onClick={onRemove}
                className="flex-1 rounded-md border border-white/30 py-1.5 text-[10px] font-bold text-white"
              >
                Remove
              </button>
            </div>
          </>
        ) : uploadState === 'uploading' ? (
          <div className="absolute inset-0 grid place-items-center bg-stone-200">
            <div className="w-3/4">
              <p className="text-xs font-semibold">Uploading image</p>
              <div className="mt-3 h-1 overflow-hidden rounded bg-stone-300">
                <span className="block h-full w-1/2 animate-[studio-shimmer_1.2s_infinite] bg-terracotta" />
              </div>
            </div>
          </div>
        ) : (
          <label className="absolute inset-0 grid cursor-pointer place-items-center">
            <div className="p-4">
              <span className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-white">
                <Plus size={17} />
              </span>
              <p className="mt-3 text-xs font-semibold">
                Add {label.toLowerCase()}
              </p>
              <p className="mt-1 text-[10px] text-stone-500">
                JPG, PNG or WebP
              </p>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFile}
              className="sr-only"
            />
          </label>
        )}
      </div>
      {asset && (
        <p className="mt-2 truncate text-[11px] font-medium text-stone-600">
          {assetDisplayName(asset.originalFileName, asset.source)}
        </p>
      )}
    </div>
  );
}

export function TryOnControls(props: {
  person: AssetView | null;
  garment: AssetView | null;
  assets: AssetView[];
  urls: Record<string, string>;
  settings: TryOnSettings;
  estimatedCost: number;
  uploadState: string;
  canSubmit: boolean;
  busy: boolean;
  error: string | null;
  onSettings(value: TryOnSettings): void;
  onUpload(role: 'PERSON' | 'GARMENT', file: File): void;
  onChoose(role: 'PERSON' | 'GARMENT', asset: AssetView): void;
  onRemove(role: 'PERSON' | 'GARMENT'): void;
  onGenerate(): void;
  onCancel(): void;
}) {
  const [picker, setPicker] = useState<'PERSON' | 'GARMENT' | null>(null);
  const update = <K extends keyof TryOnSettings>(
    key: K,
    value: TryOnSettings[K],
  ) => props.onSettings({ ...props.settings, [key]: value });
  return (
    <aside className="studio-panel flex min-h-0 flex-col border-r border-stone-300">
      <div className="px-5 pb-3 pt-5">
        <p className="studio-label text-terracotta">Active tool</p>
        <h1 className="mt-1 font-serif text-2xl">Virtual Try-On</h1>
        <p className="mt-1 text-[11px] leading-5 text-stone-500">
          Combine a person and garment into a generated look.
        </p>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-3">
        <AssetSlot
          label="Person / Model"
          asset={props.person}
          imageUrl={props.person ? props.urls[props.person.id] : undefined}
          uploadState={props.uploadState}
          onFile={(event) => {
            const file = event.target.files?.[0];
            if (file) props.onUpload('PERSON', file);
          }}
          onRemove={() => props.onRemove('PERSON')}
        />
        <button
          type="button"
          onClick={() => setPicker('PERSON')}
          className="mt-2 text-[10px] font-bold uppercase tracking-wider text-terracotta hover:text-stone-950"
        >
          Choose from Library
        </button>
        <AssetSlot
          label="Garment"
          asset={props.garment}
          imageUrl={props.garment ? props.urls[props.garment.id] : undefined}
          uploadState={props.uploadState}
          onFile={(event) => {
            const file = event.target.files?.[0];
            if (file) props.onUpload('GARMENT', file);
          }}
          onRemove={() => props.onRemove('GARMENT')}
        />
        <button
          type="button"
          onClick={() => setPicker('GARMENT')}
          className="mt-2 text-[10px] font-bold uppercase tracking-wider text-terracotta hover:text-stone-950"
        >
          Choose from Library
        </button>
        {picker && (
          <LibraryPicker
            role={picker}
            assets={props.assets}
            urls={props.urls}
            onClose={() => setPicker(null)}
            onChoose={(asset) => {
              props.onChoose(picker, asset);
              setPicker(null);
            }}
          />
        )}
        <div className="space-y-3 pt-2">
          <span className="studio-label">Direction</span>
          <label className="block text-xs font-semibold">
            Prompt <span className="font-normal text-stone-400">Optional</span>
            <textarea
              value={props.settings.prompt}
              maxLength={500}
              onChange={(event) => update('prompt', event.target.value)}
              placeholder="Describe styling, fit or mood"
              className="studio-input mt-2 min-h-20 resize-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              label="Resolution"
              value={props.settings.resolution}
              onChange={(value) =>
                update('resolution', value as TryOnSettings['resolution'])
              }
              options={[
                ['', 'Auto'],
                ['1k', '1K'],
                ['2k', '2K'],
                ['4k', '4K'],
              ]}
            />
            <Select
              label="Mode"
              value={props.settings.generationMode}
              onChange={(value) =>
                update(
                  'generationMode',
                  value as TryOnSettings['generationMode'],
                )
              }
              options={[
                ['', 'Auto'],
                ['fast', 'Fast'],
                ['balanced', 'Balanced'],
                ['quality', 'Quality'],
              ]}
            />
          </div>
          <Select
            label="Outputs"
            value={String(props.settings.outputCount)}
            onChange={(value) =>
              update(
                'outputCount',
                Number(value) as TryOnSettings['outputCount'],
              )
            }
            options={['1', '2', '3', '4'].map((value) => [value, value])}
          />
        </div>
        {props.error && (
          <p
            role="alert"
            className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800"
          >
            {props.error}
          </p>
        )}
      </div>
      <div className="sticky bottom-0 border-t border-stone-300 bg-[#f8f5ee] p-4">
        <Button
          className="h-auto min-h-12 w-full flex-col gap-0.5 py-2.5"
          disabled={!props.canSubmit || props.busy}
          onClick={props.onGenerate}
        >
          <span>{props.busy ? 'Creating try-on...' : 'Generate Try-On'}</span>
          <span className="text-[10px] font-normal text-white/65">
            {props.estimatedCost} credit{props.estimatedCost === 1 ? '' : 's'}
          </span>
        </Button>
        {props.busy && (
          <button
            onClick={props.onCancel}
            className="mt-2 w-full text-xs font-semibold text-stone-500 hover:text-stone-950"
          >
            Cancel generation
          </button>
        )}
      </div>
    </aside>
  );
}

function LibraryPicker({
  role,
  assets,
  urls,
  onChoose,
  onClose,
}: {
  role: 'PERSON' | 'GARMENT';
  assets: AssetView[];
  urls: Record<string, string>;
  onChoose(asset: AssetView): void;
  onClose(): void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-stone-950/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-[#f8f5ee] shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-300 p-5">
          <div>
            <p className="studio-label">Asset Library</p>
            <h2 className="mt-1 font-serif text-3xl">
              Choose {role === 'PERSON' ? 'a person' : 'a garment'}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close library">
            <X />
          </button>
        </div>
        <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-4">
          {assets.map((asset) => (
            <button
              key={asset.id}
              onClick={() => onChoose(asset)}
              className="overflow-hidden rounded-xl border border-stone-300 bg-white text-left hover:border-stone-950"
            >
              <div className="aspect-square bg-stone-200">
                {urls[asset.id] && (
                  <img
                    src={urls[asset.id]}
                    alt={asset.originalFileName}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <p className="truncate p-2 text-xs font-semibold">
                {asset.originalFileName}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[][];
  onChange(value: string): void;
}) {
  return (
    <label className="block text-xs font-semibold">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="studio-input mt-2 h-10"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GenerationCanvas({
  person,
  garment,
  urls,
  generation,
  outputUrls,
  selectedOutput,
  onSelectOutput,
  onRetry,
  onCreateAnother,
}: {
  person: AssetView | null;
  garment: AssetView | null;
  urls: Record<string, string>;
  generation: GenerationDetail | null;
  outputUrls: Record<string, string>;
  selectedOutput: string | null;
  onSelectOutput(id: string): void;
  onRetry(): void;
  onCreateAnother(): void;
}) {
  if (!generation)
    return (
      <div className="studio-canvas">
        {!person || !garment ? (
          <EmptyCanvas />
        ) : (
          <div className="w-full max-w-3xl rounded-xl border border-stone-300 bg-[#f5f1e9]/90 p-5 shadow-[0_24px_70px_rgba(45,38,31,.10)]">
            <div className="flex items-center justify-between border-b border-stone-300 pb-3">
              <p className="studio-label">Composition preview</p>
              <span className="text-[10px] text-stone-500">
                Ready to generate
              </span>
            </div>
            <div className="mt-5 grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <Preview image={urls[person.id]} label="Person" />
              <Plus className="mx-auto text-stone-400" size={16} />
              <Preview image={urls[garment.id]} label="Garment" />
              <span className="text-lg text-stone-400">→</span>
              <div className="grid aspect-[4/5] place-items-center border border-dashed border-stone-400 bg-white/50">
                <span className="px-3 text-center text-[10px] uppercase tracking-[.14em] text-stone-400">
                  Result artboard
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  if (
    generation.status === 'QUEUED' ||
    generation.status === 'PROCESSING' ||
    generation.status === 'CANCEL_REQUESTED'
  )
    return (
      <div className="studio-canvas">
        <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-stone-300 bg-[#f8f5ee] p-10 text-center shadow-2xl shadow-stone-400/20">
          <div className="absolute inset-x-0 top-0 h-1 animate-[studio-shimmer_1.5s_infinite] bg-terracotta" />
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-stone-900 text-white">
            <LoaderCircle className="animate-spin" size={25} />
          </div>
          <h2 className="mt-6 font-serif text-4xl">
            {generation.status === 'QUEUED'
              ? 'Your try-on is queued'
              : 'Creating your try-on'}
          </h2>
          <div className="mx-auto mt-6 max-w-xs space-y-2 text-xs text-stone-500">
            <p>Preparing model and garment</p>
            <p>Generating fashion output</p>
          </div>
        </div>
      </div>
    );
  if (generation.status === 'FAILED')
    return (
      <StateMessage
        icon={<AlertCircle size={38} />}
        title="The try-on could not be completed"
        copy={
          generation.errorMessage ??
          'The generation failed safely. You can retry with the same inputs.'
        }
        action="Retry"
        onAction={onRetry}
      />
    );
  if (generation.status === 'CANCELLED')
    return (
      <StateMessage
        icon={<X size={38} />}
        title="Generation cancelled"
        copy="Your inputs are still selected and ready when you are."
        action="Create another"
        onAction={onCreateAnother}
      />
    );
  const outputs = generation.outputs;
  const selected = selectedOutput ?? outputs[0]?.asset.id;
  const selectedUrl = selected ? outputUrls[selected] : undefined;
  return (
    <div className="studio-canvas flex-col py-6">
      <div className="flex min-h-0 w-full max-w-5xl flex-1 flex-col items-center">
        <div className="relative flex min-h-0 flex-1 items-center justify-center rounded-xl border border-stone-400 bg-[#f7f3eb] p-3 shadow-[0_28px_80px_rgba(45,38,31,.16)] before:pointer-events-none before:absolute before:inset-2 before:border before:border-stone-200">
          {selectedUrl ? (
            <img
              src={selectedUrl}
              alt="Generated virtual try-on"
              className="relative z-10 max-h-[70vh] max-w-full object-contain"
            />
          ) : (
            <LoaderCircle className="animate-spin" />
          )}
        </div>
        {outputs.length > 1 && (
          <div className="mt-4 flex gap-2">
            {outputs.map((output) => (
              <button
                key={output.id}
                onClick={() => onSelectOutput(output.asset.id)}
                aria-label="Select generated output"
                className={`h-14 w-11 overflow-hidden rounded-md border-2 ${selected === output.asset.id ? 'border-stone-950' : 'border-transparent opacity-65 hover:opacity-100'}`}
              >
                {outputUrls[output.asset.id] && (
                  <img
                    src={outputUrls[output.asset.id]}
                    alt="Output thumbnail"
                    className="h-full w-full object-cover"
                  />
                )}
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex gap-3">
          {selectedUrl && (
            <Button asChild>
              <a href={selectedUrl} download>
                Download result
              </a>
            </Button>
          )}
          <Button variant="outline" onClick={onCreateAnother}>
            Create another
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyCanvas() {
  return (
    <div className="w-full max-w-lg rounded-xl border border-stone-300 bg-[#f5f1e9]/80 p-8 text-center shadow-[0_20px_60px_rgba(45,38,31,.08)]">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg border border-stone-300 bg-white/60">
        <ImageIcon size={20} className="text-stone-500" />
      </div>
      <p className="studio-label mt-6 text-terracotta">Result artboard</p>
      <h2 className="mt-2 font-serif text-3xl">Build your first composition</h2>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-500">
        Add a person and garment from the controls or your collection.
      </p>
    </div>
  );
}
function Preview({ image, label }: { image?: string; label: string }) {
  return (
    <div>
      <div className="aspect-[4/5] overflow-hidden border border-stone-300 bg-stone-200">
        {image ? (
          <img src={image} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center">
            <Clock3 />
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-xs font-semibold">{label}</p>
    </div>
  );
}
function StateMessage({
  icon,
  title,
  copy,
  action,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
  action: string;
  onAction(): void;
}) {
  return (
    <div className="studio-canvas">
      <div className="text-center">
        {icon}
        <h2 className="mt-5 font-serif text-4xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">
          {copy}
        </p>
        <Button onClick={onAction} className="mt-7">
          {action}
        </Button>
      </div>
    </div>
  );
}

export function CollectionPanel({
  assets,
  urls,
  loading,
  onSelect,
}: {
  assets: AssetView[];
  urls: Record<string, string>;
  loading: boolean;
  onSelect(role: 'PERSON' | 'GARMENT', asset: AssetView): void;
}) {
  const [filter, setFilter] = useState<'ALL' | 'UPLOADED' | 'GENERATED'>('ALL');
  const visibleAssets = assets.filter(
    (asset) => filter === 'ALL' || asset.source === filter,
  );
  return (
    <aside className="studio-panel flex min-h-0 flex-col border-l border-stone-300">
      <div className="shrink-0 border-b border-stone-300 p-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="studio-label">Workspace assets</p>
            <h2 className="mt-2 text-lg font-bold">My Collection</h2>
          </div>
          <span className="text-xs text-stone-400">{visibleAssets.length}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 rounded-lg bg-stone-200/70 p-1">
          {(['ALL', 'UPLOADED', 'GENERATED'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`rounded-md px-2 py-1.5 text-[10px] font-bold ${filter === value ? 'bg-white text-stone-950 shadow-sm' : 'text-stone-500 hover:text-stone-950'}`}
            >
              {value === 'ALL'
                ? 'All'
                : value === 'UPLOADED'
                  ? 'Uploads'
                  : 'Generated'}
            </button>
          ))}
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-4 lg:grid-cols-1 xl:grid-cols-2">
        {loading && (
          <p className="col-span-full text-xs text-stone-500">
            Loading collection...
          </p>
        )}
        {!loading && visibleAssets.length === 0 && (
          <p className="col-span-full py-8 text-center text-xs leading-5 text-stone-500">
            No{' '}
            {filter === 'ALL'
              ? 'ready images'
              : filter.toLowerCase() + ' images'}{' '}
            yet.
          </p>
        )}
        {visibleAssets.map((asset) => (
          <article
            key={asset.id}
            className="group overflow-hidden rounded-lg border border-stone-300 bg-white transition hover:border-stone-500"
          >
            <div className="aspect-square bg-stone-200">
              {urls[asset.id] ? (
                <img
                  src={urls[asset.id]}
                  alt={asset.originalFileName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center">
                  <ImageIcon size={20} />
                </div>
              )}
            </div>
            <div className="p-2">
              {asset.generationId ? (
                <Link
                  href={`/generations/${asset.generationId}`}
                  className="block truncate text-[10px] font-semibold underline underline-offset-2"
                >
                  {assetDisplayName(asset.originalFileName, asset.source)}
                </Link>
              ) : (
                <p className="truncate text-[10px] font-semibold">
                  {assetDisplayName(asset.originalFileName, asset.source)}
                </p>
              )}
              <div className="mt-2 flex gap-1 opacity-100 lg:opacity-0 lg:transition lg:group-focus-within:opacity-100 lg:group-hover:opacity-100">
                <button
                  onClick={() => onSelect('PERSON', asset)}
                  className="flex-1 rounded bg-stone-950 px-1 py-1 text-[9px] text-white"
                >
                  Person
                </button>
                <button
                  onClick={() => onSelect('GARMENT', asset)}
                  className="flex-1 rounded border border-stone-300 px-1 py-1 text-[9px]"
                >
                  Garment
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </aside>
  );
}
