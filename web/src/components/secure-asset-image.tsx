/* eslint-disable @next/next/no-img-element -- Sources are temporary signed asset URLs. */
'use client';

import { ImageIcon, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { loadAssetAccessUrl } from '@/lib/studio-flow';

export function SecureAssetImage({ assetId, alt, className = '' }: { assetId: string; alt: string; className?: string }) {
  const { currentOrganization, request } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (currentOrganization) void loadAssetAccessUrl({ organizationId: currentOrganization.id, assetId, request }).then((next) => { if (active) setUrl(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [assetId, currentOrganization, request]);
  if (!url) return <div className={`grid place-items-center bg-stone-200 ${className}`}><LoaderCircle className="animate-spin text-stone-400" size={18} /><ImageIcon className="hidden" /></div>;
  return <img src={url} alt={alt} className={className} />;
}

export function OpenAssetButton({ assetId }: { assetId: string }) {
  const { currentOrganization, request } = useAuth();
  async function open(): Promise<void> {
    if (!currentOrganization) return;
    const url = await loadAssetAccessUrl({ organizationId: currentOrganization.id, assetId, request });
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return <button onClick={() => void open()} className="text-xs font-bold underline underline-offset-4">Open or download</button>;
}
