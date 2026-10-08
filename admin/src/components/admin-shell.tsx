'use client';

import { Activity, Building2, CreditCard, Gauge, LogOut, ServerCog, Users, WalletCards } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';

export const adminNavigation = [
  { label: 'Overview', href: '/admin', icon: Gauge }, { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Organizations', href: '/admin/organizations', icon: Building2 }, { label: 'Generations', href: '/admin/generations', icon: Activity },
  { label: 'Credits', href: '/admin/credits', icon: WalletCards }, { label: 'Billing', href: '/admin/billing', icon: CreditCard }, { label: 'System', href: '/admin/system', icon: ServerCog },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const { status, user, logout } = useAdminAuth(); const pathname = usePathname(); const router = useRouter();
  useEffect(() => { if (status === 'anonymous' || status === 'denied') router.replace('/login'); }, [router, status]);
  if (status === 'loading') return <main className="grid min-h-screen place-items-center bg-gray-50 text-sm text-gray-500">Verifying administrator access...</main>;
  if (!user || status !== 'authenticated') return null;
  return <div className="min-h-screen bg-gray-50 md:grid md:grid-cols-[232px_1fr]"><aside className="border-b border-gray-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-b-0 md:border-r"><div className="flex h-16 items-center px-5"><Link href="/admin" className="text-base font-semibold tracking-tight text-gray-950">FashionAIs Admin</Link></div><nav aria-label="Admin navigation" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pb-0 md:pt-3">{adminNavigation.map(({ label, href, icon: Icon }) => { const active = pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`)); return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'}`}><Icon size={17} strokeWidth={1.8} />{label}</Link>; })}</nav><div className="hidden border-t border-gray-200 p-4 md:block"><p className="truncate text-sm font-medium text-gray-800">{user.displayName || user.email}</p><p className="mt-0.5 truncate text-xs text-gray-500">{user.email}</p><button onClick={() => void logout().then(() => router.replace('/login'))} className="mt-4 flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"><LogOut size={16} />Sign out</button></div></aside><main className="min-w-0"><div className="mx-auto max-w-[1440px] px-5 py-7 sm:px-7 lg:px-10 lg:py-9">{children}</div></main></div>;
}
