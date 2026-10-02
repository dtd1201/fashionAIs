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
  if (status === 'loading') return <main className="grid min-h-screen place-items-center bg-slate-950 text-sm text-slate-400">Verifying system administrator access...</main>;
  if (!user || status !== 'authenticated') return null;
  return <div className="min-h-screen md:grid md:grid-cols-[250px_1fr]"><aside className="border-b border-cyan-300/10 bg-[#020713] p-5 md:min-h-screen md:border-b-0 md:border-r"><Link href="/admin" className="font-mono text-lg font-black tracking-tight text-white">FASHION<span className="text-cyan-300">/OPS</span></Link><p className="mt-2 text-[9px] uppercase tracking-[.22em] text-slate-600">System administration</p><nav className="mt-8 flex gap-2 overflow-x-auto md:flex-col">{adminNavigation.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition ${pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`)) ? 'bg-cyan-300 text-slate-950' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon size={16} />{label}</Link>)}</nav><div className="mt-10 border-t border-white/10 pt-5"><p className="truncate text-[10px] text-slate-500">{user.email}</p><button onClick={() => void logout().then(() => router.replace('/login'))} className="mt-3 flex items-center gap-2 text-xs font-bold text-rose-300"><LogOut size={14} /> Sign out</button></div></aside><main className="min-w-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,.07),transparent_35%),#0f172a] p-5 text-slate-100 md:p-9">{children}</main></div>;
}
