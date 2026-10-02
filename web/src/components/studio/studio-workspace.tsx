'use client';

import type { AssetListResponse, AssetView, CreditBalanceView, GenerationDetail, InsufficientCreditsErrorDetails } from '@fashion-ais/types';
import { Camera, Clapperboard, Images, ScanFace, Shirt, Sparkles, WandSparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { ApiClientError } from '@/lib/api/client';
import { uploadAssetFile } from '@/lib/asset-upload';
import { cancelGeneration, pollGeneration, submitGeneration } from '@/lib/generation-flow';
import { buildTryOnRequest, canBootstrapStudioData, canGenerate, estimatedTryOnCost, handleGenerationGate, loadAssetAccessUrl, type TryOnSettings } from '@/lib/studio-flow';
import { applyStudioReuse, selectExistingAsset, type StudioRole } from '@/lib/studio-library';
import { CollectionPanel, GenerationCanvas, TryOnControls } from './studio-panels';
import { BuyCreditsModal } from './buy-credits-modal';
import { AccountMenu } from '@/components/account-menu';

const tools = [
  { name: 'Try-On', icon: Shirt }, { name: 'AI Models', icon: ScanFace },
  { name: 'Photoshoot', icon: Camera }, { name: 'Fashion Design', icon: WandSparkles },
  { name: 'Campaign', icon: Images }, { name: 'Video', icon: Clapperboard },
];
const defaults: TryOnSettings = { prompt: '', resolution: '', generationMode: '', outputCount: 1 };

export function StudioWorkspace() {
  const { status, user, organizationStatus, currentOrganization, request } = useAuth();
  const [activeTool, setActiveTool] = useState('Try-On');
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [person, setPerson] = useState<AssetView | null>(null);
  const [garment, setGarment] = useState<AssetView | null>(null);
  const [settings, setSettings] = useState<TryOnSettings>(defaults);
  const [generation, setGeneration] = useState<GenerationDetail | null>(null);
  const [outputUrls, setOutputUrls] = useState<Record<string, string>>({});
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [uploadState, setUploadState] = useState('idle');
  const [error, setError] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditStatus, setCreditStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [creditPrompt, setCreditPrompt] = useState<{ required: number; available: number } | null>(null);
  const active = useRef(true);
  const activeOrganizationId = useRef<string | null>(null);
  const hydratedOrganizationId = useRef<string | null>(null);

  const loadUrl = useCallback(async (asset: AssetView): Promise<void> => {
    if (!currentOrganization) return;
    const organizationId = currentOrganization.id;
    const url = await loadAssetAccessUrl({ organizationId, assetId: asset.id, request });
    if (active.current && activeOrganizationId.current === organizationId) {
      setUrls((current) => ({ ...current, [asset.id]: url }));
    }
  }, [currentOrganization, request]);

  const loadAssets = useCallback(async (): Promise<void> => {
    if (!currentOrganization) return;
    const organizationId = currentOrganization.id;
    setLoadingAssets(true);
    try {
      const result = await request<AssetListResponse>(`/organizations/${organizationId}/assets?status=READY&kind=IMAGE&limit=100`);
      if (!active.current || activeOrganizationId.current !== organizationId) return;
      setAssets(result.items);
      await Promise.all(result.items.map((asset) => loadUrl(asset).catch(() => undefined)));
    } catch { if (active.current && activeOrganizationId.current === organizationId) setError('Unable to load your image collection.'); }
    finally { if (active.current && activeOrganizationId.current === organizationId) setLoadingAssets(false); }
  }, [currentOrganization, loadUrl, request]);

  const loadCredits = useCallback(async (): Promise<void> => {
    if (!currentOrganization) return;
    const organizationId = currentOrganization.id;
    setCreditStatus('loading');
    try {
      const result = await request<CreditBalanceView>(`/organizations/${organizationId}/credits`);
      if (active.current && activeOrganizationId.current === organizationId) {
        setCreditBalance(result.balance);
        setCreditStatus('loaded');
      }
    } catch (cause) {
      if (active.current && activeOrganizationId.current === organizationId) {
        setCreditBalance(null);
        setCreditStatus('error');
      }
      throw cause;
    }
  }, [currentOrganization, request]);

  useEffect(() => {
    let effectActive = true;
    active.current = true;
    activeOrganizationId.current = currentOrganization?.id ?? null;
    if (canBootstrapStudioData(status, currentOrganization?.id)) {
      void Promise.resolve().then(loadAssets);
      void Promise.resolve().then(() => loadCredits().catch(() => undefined));
    } else {
      void Promise.resolve().then(() => {
        if (!effectActive) return;
        setAssets([]);
        setUrls({});
        setPerson(null);
        setGarment(null);
        setCreditBalance(null);
        setCreditStatus('idle');
        setLoadingAssets(false);
        setGeneration(null);
        setOutputUrls({});
        setSelectedOutput(null);
        setCreditPrompt(null);
        setUploadState('idle');
        setError(null);
      });
    }
    return () => {
      effectActive = false;
      activeOrganizationId.current = null;
    };
  }, [currentOrganization, loadAssets, loadCredits, status]);

  useEffect(() => () => {
    active.current = false;
    activeOrganizationId.current = null;
  }, []);

  useEffect(() => {
    if (!currentOrganization || loadingAssets || hydratedOrganizationId.current === currentOrganization.id) return;
    hydratedOrganizationId.current = currentOrganization.id;
    const reuse = applyStudioReuse(window.location.search, assets, settings);
    void Promise.resolve().then(() => {
      if (reuse.person) setPerson(reuse.person);
      if (reuse.garment) setGarment(reuse.garment);
      setSettings(reuse.settings);
    });
  }, [assets, currentOrganization, loadingAssets, settings]);

  async function upload(role: 'PERSON' | 'GARMENT', file: File): Promise<void> {
    if (!user) { setError('Sign in to upload images and create a try-on.'); return; }
    if (!currentOrganization) { setError('Your organization is not available yet.'); return; }
    setUploadState('uploading'); setError(null);
    try {
      const asset = await uploadAssetFile({ organizationId: currentOrganization.id, file, request });
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      await loadUrl(asset);
      select(role, asset);
      setUploadState('complete');
    } catch (cause) { setUploadState('error'); setError(cause instanceof Error ? cause.message : 'Upload failed.'); }
  }

  function select(role: StudioRole, asset: AssetView): void { selectExistingAsset(role, asset, (nextRole, nextAsset) => { if (nextRole === 'PERSON') setPerson(nextAsset); else setGarment(nextAsset); }); }

  async function generate(): Promise<void> {
    if (!user) { setError('Sign in to generate a virtual try-on.'); return; }
    if (!currentOrganization || !person || !garment || !handleGenerationGate().allowed) return;
    const requiredCredits = estimatedTryOnCost(settings);
    if (creditBalance !== null && creditBalance < requiredCredits) {
      setCreditPrompt({ required: requiredCredits, available: creditBalance });
      return;
    }
    setError(null); setGeneration(null); setOutputUrls({});
    try {
      const created = await submitGeneration({ organizationId: currentOrganization.id, input: buildTryOnRequest(person, garment, settings), request, idempotencyKey: crypto.randomUUID() });
      setGeneration({ ...created.generation, inputs: [], outputs: [], job: created.job });
      void loadCredits();
      await pollGeneration({ organizationId: currentOrganization.id, generationId: created.generation.id, request, isActive: () => active.current, onUpdate: (next) => { setGeneration(next); if (next.status === 'COMPLETED') void loadOutputs(next); if (['FAILED', 'CANCELLED'].includes(next.status)) void loadCredits(); } });
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === 'INSUFFICIENT_CREDITS') {
        const details = cause.details as InsufficientCreditsErrorDetails | undefined;
        setCreditPrompt({ required: details?.requiredCredits ?? requiredCredits, available: details?.availableCredits ?? creditBalance ?? 0 });
        void loadCredits();
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Generation failed.');
    }
  }

  async function loadOutputs(detail: GenerationDetail): Promise<void> {
    if (!currentOrganization) return;
    const entries = await Promise.all(detail.outputs.map(async (output) => [output.asset.id, await loadAssetAccessUrl({ organizationId: currentOrganization.id, assetId: output.asset.id, request })] as const));
    setOutputUrls(Object.fromEntries(entries)); setSelectedOutput(entries[0]?.[0] ?? null); void loadAssets();
  }

  async function cancel(): Promise<void> { if (!currentOrganization || !generation) return; const result = await cancelGeneration(currentOrganization.id, generation.id, request); setGeneration((current) => current ? { ...current, ...result.generation, job: result.job } : current); }
  function reset(): void { setGeneration(null); setOutputUrls({}); setSelectedOutput(null); setError(null); }
  const busy = Boolean(generation && ['QUEUED', 'PROCESSING', 'CANCEL_REQUESTED'].includes(generation.status));

  return <div className="studio-root flex flex-col bg-[#ece8df]">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-300 bg-[#f8f5ee] px-4 lg:px-6">
      <div className="flex items-center gap-4"><Link href="/" className="font-serif text-xl font-black">FashionAIs<span className="text-terracotta">.</span></Link><span className="h-5 w-px bg-stone-300" /><span className="text-xs font-bold">Studio</span><span className="hidden text-xs text-stone-400 md:block">/ {currentOrganization?.name ?? 'Explore workspace'}</span></div>
      <div className="flex items-center gap-3"><Link href="/settings/credits" className="hidden text-right sm:block"><p className="text-[9px] font-bold uppercase tracking-[.13em] text-stone-400">Credits</p><p className="text-[11px] font-semibold">{status === 'loading' ? 'Checking session' : !user ? 'Sign in' : organizationStatus === 'loading' ? 'Loading workspace' : !currentOrganization ? 'No organization' : creditStatus === 'loading' ? 'Loading' : creditStatus === 'error' ? 'Unavailable' : creditBalance?.toLocaleString() ?? '—'}</p></Link><Button asChild variant="outline" className="h-9 px-3 text-xs"><Link href="/pricing">Buy credits</Link></Button>{status === 'authenticated' && user ? <AccountMenu compact /> : status === 'anonymous' ? <Button asChild className="h-9"><Link href="/login?returnTo=/studio">Sign in</Link></Button> : null}</div>
    </header>
    <nav aria-label="Studio tools" className="flex h-14 shrink-0 items-center gap-1 overflow-x-auto border-b border-stone-300 bg-[#f8f5ee] px-3 lg:px-5">{tools.map(({ name, icon: Icon }) => <button key={name} onClick={() => setActiveTool(name)} className={`relative flex h-full shrink-0 items-center gap-2 px-4 text-xs font-semibold transition ${activeTool === name ? 'bg-stone-200/60 text-stone-950' : 'text-stone-500 hover:bg-stone-100 hover:text-stone-950'}`}><Icon size={15} />{name}{name !== 'Try-On' && <span className="text-[8px] font-medium text-stone-400">Soon</span>}{activeTool === name && <span className="absolute inset-x-3 bottom-0 h-0.5 bg-terracotta" />}</button>)}</nav>
    <div className="min-h-0 flex-1 overflow-hidden">{activeTool === 'Try-On' ? <div className="studio-grid"><TryOnControls person={person} garment={garment} assets={assets} urls={urls} settings={settings} estimatedCost={estimatedTryOnCost(settings)} uploadState={uploadState} canSubmit={canGenerate(person, garment)} busy={busy} error={error} onSettings={setSettings} onUpload={(role, file) => void upload(role, file)} onChoose={select} onRemove={(role) => role === 'PERSON' ? setPerson(null) : setGarment(null)} onGenerate={() => void generate()} onCancel={() => void cancel()} /><GenerationCanvas person={person} garment={garment} urls={urls} generation={generation} outputUrls={outputUrls} selectedOutput={selectedOutput} onSelectOutput={setSelectedOutput} onRetry={() => void generate()} onCreateAnother={reset} /><CollectionPanel assets={assets} urls={urls} loading={loadingAssets} onSelect={select} /></div> : <div className="grid h-full place-items-center p-8 text-center"><div className="animate-[editorial-rise_.35s_ease-out]"><Sparkles className="mx-auto text-terracotta" size={34} /><p className="studio-label mt-6">In development</p><h1 className="mt-3 font-serif text-5xl">{activeTool}</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-stone-500">This tool is visible as part of the suite roadmap. It is not connected to generation or payment yet.</p></div></div>}</div>
    {status === 'anonymous' && <div className="fixed bottom-5 left-1/2 z-50 flex w-[min(92%,560px)] -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-stone-950 bg-[#f8f5ee] p-4 shadow-2xl"><div><p className="text-sm font-bold">Sign in required for uploads and generation.</p><p className="mt-1 text-xs text-stone-500">You can explore the Studio before signing in.</p></div><Button asChild><Link href="/login?returnTo=/studio">Sign in</Link></Button></div>}
    {creditPrompt && <BuyCreditsModal required={creditPrompt.required} available={creditPrompt.available} onClose={() => setCreditPrompt(null)} />}
  </div>;
}
