'use client';

import { Layers3 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { AssetUploadProof } from '@/components/asset-upload-proof';
import { GenerationProof } from '@/components/generation-proof';

export default function DashboardPage() {
  const router = useRouter();
  const {
    status,
    user,
    currentOrganization,
    currentRole,
    organizationStatus,
    organizationError,
    logout,
  } = useAuth();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status === 'loading')
    return (
      <main className="grid min-h-[60vh] place-items-center text-stone-500">
        Loading your session...
      </main>
    );
  if (!user) return null;

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 lg:px-10">
      <div className="flex flex-col justify-between gap-6 border-b border-stone-300 pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-amber-700">
            Workspace
          </p>
          <h1 className="mt-2 font-serif text-5xl font-black tracking-tight">
            Your studio
          </h1>
        </div>
        <div className="text-right">
          <p className="mb-3 text-sm text-stone-600">{user.email}</p>
          <Button
            onClick={() => void logout().then(() => router.replace('/login'))}
          >
            Sign out
          </Button>
        </div>
      </div>
      <div className="mt-6 text-sm text-stone-600">
        {organizationStatus === 'loading' && <p>Loading organization...</p>}
        {currentOrganization && <p>Organization: {currentOrganization.name}</p>}
        {currentRole && <p>Role: {currentRole}</p>}
        {organizationError && <p role="alert">{organizationError}</p>}
      </div>
      <section className="mt-12 grid min-h-80 place-items-center rounded-[2rem] border border-dashed border-stone-300 bg-white/50 p-8 text-center">
        <div>
          <Layers3 className="mx-auto text-amber-700" size={36} />
          <h2 className="mt-5 font-serif text-2xl font-bold">
            The canvas is ready
          </h2>
          <p className="mx-auto mt-2 max-w-md text-stone-600">
            Authenticated product modules will appear here as they are
            introduced.
          </p>
        </div>
      </section>
      <AssetUploadProof />
      <GenerationProof />
    </main>
  );
}
