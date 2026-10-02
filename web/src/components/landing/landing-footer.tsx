import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const columns = [
  ['Tools', [['Virtual Try-On', '/studio'], ['AI Models', '#tools'], ['Photoshoot', '#tools'], ['Fashion Video', '#tools']]],
  ['Product', [['Studio', '/studio'], ['Pricing', '/pricing'], ['Dashboard', '/dashboard']]],
  ['Company', [['Privacy', '#'], ['Terms', '#'], ['Contact', 'mailto:hello@fashionais.local']]],
] as const;

export function LandingFooter() {
  return <footer className="bg-[#171815] text-[#f5f0e6]"><section className="landing-shell border-b border-white/15 py-24 text-center"><p className="eyebrow justify-center text-[#d88967]">Your next campaign</p><h2 className="mx-auto mt-6 max-w-5xl font-serif text-5xl leading-none tracking-[-.04em] sm:text-7xl lg:text-8xl">Build your next fashion campaign with AI.</h2><div className="mt-10 flex flex-wrap justify-center gap-3"><Button asChild className="bg-[#f5f0e6] text-stone-950 hover:bg-[#d88967]"><Link href="/studio">Start creating <ArrowUpRight className="ml-2" size={17} /></Link></Button><Button asChild variant="outline" className="border-white/30 bg-transparent text-white hover:border-white"><Link href="/studio">Open studio</Link></Button></div></section><div className="landing-shell grid gap-14 py-16 md:grid-cols-[1.4fr_2fr]"><div><Link href="/" className="font-serif text-4xl font-black">FashionAIs</Link><p className="mt-5 max-w-xs text-sm leading-6 text-stone-500">A creative operating system for fashion teams building what comes next.</p></div><div className="grid grid-cols-2 gap-10 sm:grid-cols-3">{columns.map(([title, links]) => <div key={title}><p className="text-xs font-bold uppercase tracking-[.16em] text-stone-500">{title}</p><div className="mt-5 flex flex-col gap-3">{links.map(([label, href]) => <Link key={label} href={href} className="text-sm text-stone-300 hover:text-white">{label}</Link>)}</div></div>)}</div></div><div className="landing-shell flex flex-col justify-between gap-3 border-t border-white/10 py-6 text-[10px] uppercase tracking-[.16em] text-stone-600 sm:flex-row"><span>© 2026 FashionAIs</span><span>Built for original fashion work</span></div></footer>;
}
