'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { AccountMenu } from '@/components/account-menu';
import { Menu } from 'lucide-react';

const publicNavigation = [['Studio', '/studio'], ['Tools', '/#tools'], ['Virtual Try-On', '/#virtual-try-on'], ['Pricing', '/pricing']];

export function SiteHeader() {
  const { status } = useAuth();
  const pathname = usePathname();
  if (pathname.startsWith('/studio')) return null;
  const authenticated = status === 'authenticated';
  const navigation = authenticated ? [['Studio', '/studio'], ['Generations', '/generations'], ['Library', '/library'], ['Settings', '/settings/profile'], ['Credits', '/settings/credits']] : publicNavigation;
  return (
    <header className="sticky top-0 z-50 border-b border-stone-900/10 bg-[#f5f0e6]/90 backdrop-blur-xl">
      <div className="landing-shell flex h-[76px] items-center justify-between gap-6">
        <Link href="/" className="font-serif text-2xl font-black tracking-[-.04em]">FashionAIs<span className="text-terracotta">.</span></Link>
        <nav className="hidden items-center gap-1 lg:flex">{navigation.map(([label, href]) => { const active = href.startsWith('/') && href !== '/' && pathname.startsWith(href); return <Link key={label} href={href} aria-current={active ? 'page' : undefined} className={`rounded-md px-3 py-2 text-xs font-semibold transition ${active ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-white/60 hover:text-stone-950'}`}>{label}</Link>; })}</nav>
        <div className="flex items-center gap-3">
          {authenticated ? <AccountMenu /> : <><Link href="/login" className="hidden text-sm font-semibold sm:block">Sign in</Link><Button asChild className="px-5"><Link href="/studio">Start creating</Link></Button></>}
          <details className="group relative lg:hidden">
            <summary className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-stone-300 bg-white/60" aria-label="Open navigation"><Menu size={18} /></summary>
            <nav className="absolute right-0 mt-3 w-64 rounded-xl border border-stone-300 bg-[#fbf8f1] p-2 shadow-xl">{navigation.map(([label, href]) => <Link key={label} href={href} className="block rounded-lg px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-200/70">{label}</Link>)}</nav>
          </details>
        </div>
      </div>
    </header>
  );
}
