'use client';

import type {
  GenerationDetail,
  GenerationListResponse,
} from '@fashion-ais/types';
import { ArrowRight, Clock3, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { SecureAssetImage } from '@/components/secure-asset-image';
import { Button } from '@/components/ui/button';
import { humanizeEnum, statusTone } from '@/lib/presentation';

const activeStatuses = new Set(['QUEUED', 'PROCESSING', 'CANCEL_REQUESTED']);

export default function GenerationsPage() {
  const { status, currentOrganization, request } = useAuth();
  const [items, setItems] = useState<GenerationDetail[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const result = await request<GenerationListResponse>(
        `/organizations/${currentOrganization.id}/generations?limit=12${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      setItems(result.items);
      setNextCursor(result.pageInfo.nextCursor);
      setError(null);
    } catch {
      setError('We could not load your creations.');
    } finally {
      setLoading(false);
    }
  }, [currentOrganization, cursor, request]);
  useEffect(() => {
    if (status === 'authenticated' && currentOrganization)
      void Promise.resolve().then(load);
  }, [currentOrganization, load, status]);
  useEffect(() => {
    if (!items.some((item) => activeStatuses.has(item.status))) return;
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [items, load]);
  async function cancel(item: GenerationDetail) {
    if (!currentOrganization) return;
    await request(
      `/organizations/${currentOrganization.id}/generations/${item.id}/cancel`,
      { method: 'POST' },
    );
    await load();
  }
  if (status === 'loading') return <PageLoading />;
  if (status === 'anonymous') return <Gate />;
  return (
    <main className="landing-shell py-12 lg:py-16">
      <header className="flex flex-col justify-between gap-6 border-b border-stone-300 pb-8 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-terracotta">Generation archive</p>
          <h1 className="mt-3 font-serif text-5xl font-black md:text-7xl">
            My Creations
          </h1>
          <p className="mt-3 max-w-xl text-sm text-stone-500">
            Every experiment, source and finished output in your active
            workspace.
          </p>
        </div>
        <Button asChild>
          <Link href="/studio">Create in Studio</Link>
        </Button>
      </header>
      {error && (
        <p
          role="alert"
          className="mt-8 border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {loading ? (
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-96 animate-pulse rounded-2xl bg-stone-200"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <section className="mt-12 grid min-h-80 place-items-center rounded-3xl border border-dashed border-stone-400 text-center">
          <div>
            <Sparkles className="mx-auto text-terracotta" />
            <h2 className="mt-4 font-serif text-3xl">
              Your first creation starts here
            </h2>
            <Button asChild className="mt-6">
              <Link href="/studio">Open Studio</Link>
            </Button>
          </div>
        </section>
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <GenerationCard
              key={item.id}
              item={item}
              onCancel={() => void cancel(item)}
            />
          ))}
        </div>
      )}
      <div className="mt-10 flex justify-between">
        <Button
          variant="outline"
          disabled={!cursor}
          onClick={() => setCursor(null)}
        >
          First page
        </Button>
        <Button disabled={!nextCursor} onClick={() => setCursor(nextCursor)}>
          Next page
        </Button>
      </div>
    </main>
  );
}

function GenerationCard({
  item,
  onCancel,
}: {
  item: GenerationDetail;
  onCancel(): void;
}) {
  const output = item.outputs[0]?.asset;
  const person = item.inputs.find((input) => input.role === 'PERSON')?.asset;
  const garment = item.inputs.find((input) => input.role === 'GARMENT')?.asset;
  return (
    <article className="group overflow-hidden rounded-xl border border-stone-300 bg-[#f8f5ee] transition duration-300 hover:-translate-y-0.5 hover:border-stone-500 hover:shadow-[0_16px_40px_rgba(45,38,31,.08)]">
      <Link
        href={`/generations/${item.id}`}
        className="block aspect-[4/3] overflow-hidden bg-stone-200"
      >
        {output ? (
          <SecureAssetImage
            assetId={output.id}
            alt="Generated output"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="grid h-full place-items-center text-stone-400">
            <Clock3 />
          </div>
        )}
      </Link>
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <span className={`status-badge ${statusTone(item.status)}`}>
            {humanizeEnum(item.status)}
          </span>
          <time className="text-xs text-stone-500" dateTime={item.createdAt}>
            {new Date(item.createdAt).toLocaleDateString()}
          </time>
        </div>
        <h2 className="mt-4 font-serif text-2xl">{humanizeEnum(item.type)}</h2>
        <p className="mt-2 text-xs text-stone-500">
          {item.outputs.length} output{item.outputs.length === 1 ? '' : 's'} ·{' '}
          {item.creditCost} credit{item.creditCost === 1 ? '' : 's'}
        </p>
        {item.status === 'FAILED' && (
          <p className="mt-3 text-xs leading-5 text-red-700">
            {item.errorMessage}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          {[person, garment].map(
            (asset, index) =>
              asset && (
                <SecureAssetImage
                  key={asset.id}
                  assetId={asset.id}
                  alt={index ? 'Garment' : 'Person'}
                  className="h-12 w-12 rounded-md object-cover"
                />
              ),
          )}
        </div>
        <div className="mt-5 flex items-center justify-between">
          {activeStatuses.has(item.status) ? (
            <button
              onClick={onCancel}
              className="rounded-md px-2 py-1 text-xs font-bold text-red-800 hover:bg-red-50"
            >
              Cancel
            </button>
          ) : (
            <span />
          )}
          <Link
            href={`/generations/${item.id}`}
            className="flex items-center gap-1 text-xs font-bold"
          >
            View details <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}
function PageLoading() {
  return (
    <main className="grid min-h-[60vh] place-items-center text-sm text-stone-500">
      Loading creations...
    </main>
  );
}
function Gate() {
  return (
    <main className="grid min-h-[70vh] place-items-center text-center">
      <div>
        <h1 className="font-serif text-5xl">Your creations are private</h1>
        <p className="mt-3 text-stone-500">
          Sign in to view your organization history.
        </p>
        <Button asChild className="mt-6">
          <Link href="/login?returnTo=/generations">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
