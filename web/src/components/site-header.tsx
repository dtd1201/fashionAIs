'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { AccountMenu } from '@/components/account-menu';

const publicNavigation = [['Studio', '/studio'], ['Tools', '/#tools'], ['Virtual Try-On', '/#virtual-try-on'], ['Pricing', '/pricing']];

export function SiteHeader() {
  const { status } = useAuth();
  const pathname = usePathname();
  if (pathname.startsWith('/studio')) return null;
  const authenticated = status === 'authenticated';
  return (
    <header className="sticky top-0 z-50 border-b border-stone-900/10 bg-[#f5f0e6]/90 backdrop-blur-xl">
      <div className="landing-shell flex h-[76px] items-center justify-between gap-6">
        <Link href="/" className="font-serif text-2xl font-black tracking-[-.04em]">FashionAIs<span className="text-terracotta">.</span></Link>
        <nav className="hidden items-center gap-6 lg:flex">{(authenticated ? [['Studio', '/studio'], ['Generations', '/generations'], ['Library', '/library'], ['Settings', '/settings/profile'], ['Credits', '/settings/credits']] : publicNavigation).map(([label, href]) => <Link key={label} href={href} className="text-xs font-semibold text-stone-600 transition hover:text-stone-950">{label}</Link>)}</nav>
        <div className="flex items-center gap-3">
          {authenticated ? <AccountMenu /> : <><Link href="/login" className="hidden text-sm font-semibold sm:block">Sign in</Link><Button asChild className="px-5"><Link href="/studio">Start creating</Link></Button></>}
        </div>
      </div>
    </header>
  );
}
