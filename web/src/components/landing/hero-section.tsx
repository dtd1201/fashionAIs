import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="landing-shell grid min-h-[780px] items-center gap-14 pb-24 pt-12 lg:grid-cols-[1.02fr_.98fr] lg:pt-20">
      <div className="relative z-10 animate-[editorial-rise_.8s_ease-out_both]">
        <p className="eyebrow"><Sparkles size={13} /> AI fashion studio</p>
        <h1 className="display-title mt-7 max-w-3xl text-[clamp(4.4rem,9vw,8.6rem)] leading-[.78]">Create fashion <em className="font-normal text-terracotta">campaigns</em> with AI</h1>
        <p className="mt-9 max-w-xl text-lg leading-8 text-stone-600">Design looks, try garments on models, create campaign imagery, and explore fashion motion—all from one private workspace.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button asChild className="h-12 px-7"><Link href="/studio">Start creating <ArrowUpRight className="ml-2" size={17} /></Link></Button>
          <Button asChild variant="outline" className="h-12 px-7"><Link href="/studio">Try virtual try-on</Link></Button>
        </div>
        <div className="mt-14 grid max-w-xl grid-cols-3 border-y border-stone-300 py-5 text-xs uppercase tracking-[.14em] text-stone-500"><span>AI-powered tools</span><span className="text-center">Fast generation</span><span className="text-right">Private workspace</span></div>
      </div>
      <div className="relative mx-auto h-[620px] w-full max-w-[620px] animate-[editorial-rise_1s_.15s_ease-out_both] sm:h-[680px]">
        <div className="fashion-frame absolute left-[6%] top-6 h-[72%] w-[58%] rotate-[-2deg] bg-[#b99e86]"><div className="fashion-silhouette fashion-silhouette-tall" /><span className="visual-caption">LOOK 01 / FORM</span></div>
        <div className="fashion-frame absolute right-[2%] top-[17%] h-[38%] w-[37%] rotate-[3deg] bg-[#26302a]"><div className="fashion-silhouette fashion-silhouette-crop" /><span className="visual-caption text-white">TEXTURE STUDY</span></div>
        <div className="fashion-frame absolute bottom-[3%] right-[8%] h-[36%] w-[48%] rotate-[-1deg] bg-[#d9d0bf]"><div className="fashion-silhouette fashion-silhouette-wide" /><span className="visual-caption">CAMPAIGN / 26</span></div>
        <div className="absolute bottom-[18%] left-0 z-20 flex items-center gap-3 rounded-full border border-stone-900 bg-[#f5f0e6] px-5 py-3 text-xs font-bold uppercase tracking-[.16em] shadow-xl">Ready for the studio <ArrowDownRight size={16} /></div>
        <div className="absolute right-0 top-0 font-serif text-8xl italic text-stone-300/70">AI</div>
      </div>
    </section>
  );
}
