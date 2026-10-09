import type { ReactNode } from 'react';

export function SettingsTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold uppercase tracking-[.18em] text-terracotta">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-serif text-3xl tracking-[-.03em] sm:text-4xl">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
        {description}
      </p>
    </div>
  );
}

export function SettingsCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-stone-300 bg-white/60 p-5 md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-stone-200 py-3 first:pt-0 last:border-0 last:pb-0 sm:grid-cols-[160px_1fr] sm:items-baseline">
      <dt className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">
        {label}
      </dt>
      <dd className="text-sm font-semibold text-stone-800">{value}</dd>
    </div>
  );
}
