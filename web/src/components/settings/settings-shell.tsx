'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { settingsNavigation } from '@/lib/settings';

export function SettingsShell({ children }: { children: ReactNode }) {
  const { status, organizationStatus, currentOrganization, currentRole } =
    useAuth();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (status === 'anonymous')
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
  }, [pathname, router, status]);

  if (
    status === 'loading' ||
    (status === 'authenticated' && organizationStatus === 'loading')
  ) {
    return (
      <main className="grid min-h-[65vh] place-items-center text-sm text-stone-500">
        Loading account settings...
      </main>
    );
  }
  if (status !== 'authenticated') return null;

  return (
    <main className="landing-shell py-7 lg:py-10">
      <header className="mx-auto max-w-[1180px] border-b border-stone-300 pb-6">
        <p className="eyebrow text-terracotta">Account control room</p>
        <div className="mt-3 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="font-serif text-4xl font-black tracking-[-.045em] md:text-5xl">
              Settings
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              Manage your account and{' '}
              {currentOrganization?.name ?? 'organization'} workspace.
            </p>
          </div>
          {currentRole && (
            <span className="w-fit rounded-full border border-stone-300 bg-white/50 px-4 py-2 text-[10px] font-bold uppercase tracking-[.16em]">
              {currentRole}
            </span>
          )}
        </div>
      </header>
      <div className="mx-auto mt-6 grid max-w-[1180px] gap-8 lg:grid-cols-[210px_minmax(0,900px)]">
        <aside>
          <nav
            aria-label="Settings"
            className="flex gap-2 overflow-x-auto border-b border-stone-300 pb-3 lg:sticky lg:top-28 lg:flex-col lg:border-b-0 lg:pb-0"
          >
            {settingsNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                className={`shrink-0 rounded-md border px-4 py-3 text-xs font-bold transition ${pathname === item.href ? 'border-stone-950 bg-stone-950 text-white shadow-[inset_3px_0_0_#c77855]' : 'border-transparent text-stone-500 hover:border-stone-300 hover:bg-white/50 hover:text-stone-950'}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <section className="min-w-0 max-w-[900px]">{children}</section>
      </div>
    </main>
  );
}
