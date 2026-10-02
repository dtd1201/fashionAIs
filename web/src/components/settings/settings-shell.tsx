'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { settingsNavigation } from '@/lib/settings';

export function SettingsShell({ children }: { children: ReactNode }) {
  const { status, organizationStatus, currentOrganization, currentRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => { if (status === 'anonymous') router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`); }, [pathname, router, status]);

  if (status === 'loading' || (status === 'authenticated' && organizationStatus === 'loading')) {
    return <main className="grid min-h-[65vh] place-items-center text-sm text-stone-500">Loading account settings...</main>;
  }
  if (status !== 'authenticated') return null;

  return (
    <main className="landing-shell py-10 lg:py-16">
      <header className="border-b border-stone-300 pb-8">
        <p className="eyebrow text-terracotta">Account control room</p>
        <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><h1 className="font-serif text-5xl font-black tracking-[-.05em] md:text-7xl">Settings</h1><p className="mt-3 text-sm text-stone-500">Manage your account and {currentOrganization?.name ?? 'organization'} workspace.</p></div>
          {currentRole && <span className="w-fit rounded-full border border-stone-300 bg-white/50 px-4 py-2 text-[10px] font-bold uppercase tracking-[.16em]">{currentRole}</span>}
        </div>
      </header>
      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside><nav aria-label="Settings" className="flex gap-2 overflow-x-auto lg:sticky lg:top-28 lg:flex-col">{settingsNavigation.map((item) => <Link key={item.href} href={item.href} className={`shrink-0 border-l-2 px-4 py-3 text-xs font-bold transition ${pathname === item.href ? 'border-terracotta bg-white/60 text-stone-950' : 'border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-950'}`}>{item.label}</Link>)}</nav></aside>
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}
