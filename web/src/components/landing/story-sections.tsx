import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HowItWorks() {
  const steps = [
    ['01', 'Upload', 'Add a person, garment, product, or visual reference to your private workspace.'],
    ['02', 'Create', 'Choose an AI fashion workflow and set the generation direction.'],
    ['03', 'Export', 'Review generated assets and continue building your campaign.'],
  ];
  return (
    <section id="how-it-works" className="landing-shell py-28">
      <p className="eyebrow">A focused process</p><h2 className="section-title mt-5 max-w-3xl">From source image to campaign asset</h2>
      <div className="mt-16 grid border-y border-stone-300 md:grid-cols-3">
        {steps.map(([number, title, copy]) => <article key={number} className="border-b border-stone-300 py-9 md:border-b-0 md:border-r md:px-9 md:first:pl-0 md:last:border-r-0"><span className="font-mono text-xs text-terracotta">{number}</span><h3 className="mt-12 font-serif text-4xl">{title}</h3><p className="mt-4 max-w-xs text-sm leading-6 text-stone-600">{copy}</p></article>)}
      </div>
    </section>
  );
}

export function VirtualTryOnFeature() {
  return (
    <section id="virtual-try-on" className="bg-[#ddd2c1] py-24 lg:py-32">
      <div className="landing-shell grid items-center gap-16 lg:grid-cols-[1.1fr_.9fr]">
        <div className="grid h-[570px] grid-cols-[.75fr_.45fr_.9fr] items-center gap-3">
          <EditorialTile tone="sand" label="01 / PERSON" silhouette="person" />
          <EditorialTile tone="ink" label="02 / GARMENT" silhouette="garment" small />
          <EditorialTile tone="clay" label="03 / OUTPUT" silhouette="output" />
        </div>
        <div>
          <p className="eyebrow">Available now</p><h2 className="section-title mt-5">Try the look before the shoot.</h2>
          <p className="mt-7 max-w-lg text-lg leading-8 text-stone-700">Bring together a person image and a garment image. FashionAIs runs the try-on in the background and stores the finished output in your organization workspace.</p>
          <ul className="mt-8 space-y-4 text-sm">{['Upload a person image', 'Upload a garment image', 'Generate a virtual try-on', 'Keep outputs in your workspace'].map((item) => <li key={item} className="flex items-center gap-3"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-950 text-white"><Check size={13} /></span>{item}</li>)}</ul>
          <Button asChild className="mt-10 h-12 px-7"><Link href="/studio">Try Virtual Try-On <ArrowUpRight className="ml-2" size={17} /></Link></Button>
        </div>
      </div>
    </section>
  );
}

function EditorialTile({ tone, label, silhouette, small = false }: { tone: string; label: string; silhouette: string; small?: boolean }) {
  return <div className={`editorial-tile editorial-${tone} ${small ? 'h-[58%]' : 'h-[88%]'}`}><div className={`demo-figure demo-${silhouette}`} /><span className="absolute bottom-4 left-4 text-[10px] font-bold tracking-[.15em]">{label}</span></div>;
}

export function UseCases() {
  const cases = [
    ['E-commerce', 'Build clear product storytelling for digital storefronts.', '01'],
    ['Campaigns', 'Explore a visual direction before committing to production.', '02'],
    ['Social content', 'Create a more consistent stream of fashion visuals.', '03'],
    ['Lookbooks', 'Organize silhouettes and garment stories into a collection.', '04'],
  ];
  return (
    <section id="use-cases" className="landing-shell py-28"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="eyebrow">Built for the work</p><h2 className="section-title mt-5">One studio, many directions</h2></div><p className="max-w-sm text-sm leading-6 text-stone-600">Visual examples of where your generated assets can go next—not additional automated presets.</p></div>
      <div className="mt-14 grid gap-5 md:grid-cols-2">{cases.map(([title, copy, number], index) => <article key={title} className={`use-case-card ${index === 1 || index === 2 ? 'bg-[#26302a] text-white' : 'bg-[#c48b6d] text-stone-950'}`}><span className="font-mono text-xs opacity-60">{number}</span><div><h3 className="font-serif text-4xl sm:text-5xl">{title}</h3><p className="mt-3 max-w-sm text-sm leading-6 opacity-70">{copy}</p></div></article>)}</div>
    </section>
  );
}

export function StyleShowcase() {
  const styles = ['Streetwear', 'Minimal', 'Luxury', 'Editorial', 'Sportswear', 'Y2K', 'Evening', 'Techwear'];
  return (
    <><section id="inspiration" className="border-y border-stone-300 py-24"><div className="landing-shell"><p className="eyebrow">Creative references</p><h2 className="section-title mt-5">Find your visual language</h2><p className="mt-5 text-sm text-stone-500">Inspiration categories only—these are not automated presets.</p><div className="mt-12 flex gap-4 overflow-x-auto pb-5">{styles.map((style, index) => <div key={style} className="style-card shrink-0" style={{ '--style-index': index } as CSSProperties}><span>{style}</span></div>)}</div></div></section><Gallery /></>
  );
}

function Gallery() {
  return <section className="bg-[#f0eadf] py-28"><div className="landing-shell"><div className="flex items-end justify-between"><div><p className="eyebrow">Studio studies</p><h2 className="section-title mt-5">Made with FashionAIs</h2></div><span className="hidden text-xs uppercase tracking-[.16em] text-stone-500 md:block">Demo compositions / replace with campaign work</span></div><div className="gallery-grid mt-14">{Array.from({ length: 7 }, (_, index) => <article key={index} className={`gallery-piece gallery-piece-${index + 1}`}><div className={`demo-figure demo-gallery-${index + 1}`} /><span>STUDY 0{index + 1}</span></article>)}</div></div></section>;
}
