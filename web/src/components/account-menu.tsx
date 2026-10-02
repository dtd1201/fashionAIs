'use client';

import { ChevronDown, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { accountNavigation, signOutAccount } from '@/lib/settings';

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;

  async function signOut(): Promise<void> {
    await signOutAccount(logout, () => router.replace('/login'));
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-stone-300 bg-white/70 px-3 py-2 text-xs font-semibold hover:border-stone-500">
        <span className={compact ? 'hidden lg:block max-w-32 truncate' : 'hidden sm:block max-w-40 truncate'}>{user.email}</span>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-white">{user.email.slice(0, 1).toUpperCase()}</span>
        <ChevronDown size={13} className="transition group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-[90] mt-2 w-56 overflow-hidden rounded-xl border border-stone-300 bg-[#f8f5ee] p-2 shadow-2xl">
        <p className="truncate border-b border-stone-200 px-3 py-2 text-[10px] text-stone-500">{user.email}</p>
        {accountNavigation.map((item) => <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-2 text-xs font-semibold hover:bg-stone-200">{item.label}</Link>)}
        <button onClick={() => void signOut()} className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-stone-200 px-3 py-2 text-left text-xs font-semibold text-red-800 hover:bg-red-50"><LogOut size={14} /> Sign out</button>
      </div>
    </details>
  );
}
