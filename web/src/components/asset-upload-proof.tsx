'use client';

import { useState, type ChangeEvent } from 'react';
import type { AssetView } from '@fashion-ais/types';
import { useAuth } from '@/components/auth-provider';
import { uploadAssetFile } from '@/lib/asset-upload';
import { Button } from '@/components/ui/button';

type UploadState = 'idle' | 'uploading' | 'complete' | 'error';

export function AssetUploadProof() {
  const { currentOrganization, request } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>('idle');
  const [asset, setAsset] = useState<AssetView | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectFile(event: ChangeEvent<HTMLInputElement>): void {
    setFile(event.target.files?.[0] ?? null);
    setAsset(null);
    setError(null);
    setState('idle');
  }

  async function upload(): Promise<void> {
    if (!file) return;
    setState('uploading');
    setError(null);
    try {
      const uploaded = await uploadAssetFile({
        organizationId: currentOrganization?.id ?? null,
        file,
        request,
      });
      setAsset(uploaded);
      setState('complete');
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'Asset upload failed.',
      );
      setState('error');
    }
  }

  return (
    <section className="mt-10 border-t border-stone-300 pt-8">
      <p className="text-xs font-bold uppercase tracking-[.2em] text-amber-700">
        Storage proof
      </p>
      <h2 className="mt-2 font-serif text-2xl font-bold">
        Direct asset upload
      </h2>
      <p className="mt-2 max-w-xl text-sm text-stone-600">
        Files upload directly to object storage after backend authorization.
      </p>
      <div className="mt-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <input
          type="file"
          onChange={selectFile}
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,application/pdf"
          className="max-w-full text-sm"
        />
        <Button
          type="button"
          disabled={!file || !currentOrganization || state === 'uploading'}
          onClick={() => void upload()}
        >
          {state === 'uploading' ? 'Uploading...' : 'Upload asset'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {asset && (
        <dl className="mt-5 grid max-w-xl grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
          <dt className="font-semibold">Asset</dt>
          <dd>{asset.originalFileName}</dd>
          <dt className="font-semibold">Kind</dt>
          <dd>{asset.kind}</dd>
          <dt className="font-semibold">Status</dt>
          <dd>{asset.status}</dd>
          <dt className="font-semibold">Size</dt>
          <dd>{asset.fileSize.toLocaleString()} bytes</dd>
        </dl>
      )}
    </section>
  );
}
