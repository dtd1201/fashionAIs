import type { ReactNode } from 'react';

export function SettingsTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="mb-8"><p className="text-[10px] font-bold uppercase tracking-[.18em] text-terracotta">{eyebrow}</p><h2 className="mt-2 font-serif text-4xl tracking-[-.03em]">{title}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">{description}</p></div>;
}

export function SettingsCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border border-stone-300 bg-white/60 p-6 shadow-[0_18px_50px_rgba(35,28,22,.06)] md:p-8 ${className}`}>{children}</div>;
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return <div className="border-b border-stone-200 py-4 first:pt-0 last:border-0 last:pb-0"><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-stone-400">{label}</dt><dd className="mt-1 text-sm font-semibold text-stone-800">{value}</dd></div>;
}
