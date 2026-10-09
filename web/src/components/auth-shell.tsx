import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="grid min-h-[calc(100dvh-77px)] bg-[#f8f4eb] lg:grid-cols-[42%_58%]">
      <section className="relative hidden min-h-[720px] overflow-hidden bg-[#1e211d] px-10 py-9 text-[#f5f0e6] lg:flex lg:flex-col xl:px-14 xl:py-11">
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:48px_48px]" />
        <Link href="/" className="relative z-10 font-serif text-3xl font-black">
          FashionAIs<span className="text-[#d88967]">.</span>
        </Link>
        <div className="relative my-auto grid min-h-[500px] grid-cols-[1.08fr_.72fr] items-center gap-4 py-10">
          <div className="relative z-10">
            <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#d88967]">
              Private fashion workspace
            </p>
            <p className="mt-5 max-w-md font-serif text-[clamp(3.4rem,4.7vw,5.4rem)] leading-[.86] tracking-[-.055em]">
              Shape the look before the shoot.
            </p>
            <p className="mt-6 max-w-sm text-sm leading-6 text-stone-400">
              Bring people, garments and creative direction together in one
              focused studio.
            </p>
          </div>
          <div className="relative h-[430px]">
            <div className="absolute -left-8 top-4 h-[78%] w-[88%] rotate-[-3deg] overflow-hidden border border-white/20 bg-[#b98c73] shadow-2xl">
              <div className="fashion-silhouette fashion-silhouette-wide" />
              <span className="visual-caption">FORM / 01</span>
            </div>
            <div className="absolute bottom-2 right-0 h-[48%] w-[72%] rotate-[3deg] overflow-hidden border border-white/20 bg-[#ded3c0] shadow-2xl">
              <div className="fashion-silhouette fashion-silhouette-crop" />
              <span className="visual-caption text-stone-950">LOOK / 02</span>
            </div>
            <span className="absolute right-1 top-0 font-serif text-7xl italic text-white/10">
              AI
            </span>
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between border-t border-white/15 pt-5 text-[9px] font-bold uppercase tracking-[.18em] text-stone-500">
          <span>Virtual Try-On</span>
          <span>Private by workspace</span>
        </div>
      </section>
      <section className="flex items-start px-5 py-10 sm:px-10 sm:py-14 lg:items-center lg:px-12 xl:px-20">
        <div className="w-full max-w-[480px] lg:-mt-4">
          <Link href="/" className="font-serif text-2xl font-black lg:hidden">
            FashionAIs<span className="text-terracotta">.</span>
          </Link>
          <p className="eyebrow mt-9 text-terracotta lg:mt-0">{eyebrow}</p>
          <h1 className="mt-4 max-w-md font-serif text-5xl font-semibold leading-[.92] tracking-[-.045em] sm:text-6xl">
            {title}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-stone-600">
            {description}
          </p>
          {children}
          <div className="mt-6 text-sm text-stone-600">{footer}</div>
        </div>
      </section>
    </main>
  );
}

export function AuthField(props: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  minLength?: number;
  hint?: string;
}) {
  const { label, hint, ...inputProps } = props;
  return (
    <label className="block text-xs font-bold uppercase tracking-[.1em] text-stone-600">
      {label}
      <input
        {...inputProps}
        required
        className="studio-input mt-2 h-12 text-sm normal-case tracking-normal text-stone-950"
      />
      {hint && (
        <span className="mt-2 block text-xs font-normal normal-case tracking-normal text-stone-500">
          {hint}
        </span>
      )}
    </label>
  );
}
