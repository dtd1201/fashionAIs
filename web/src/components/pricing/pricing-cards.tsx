import Link from 'next/link';
import { Check, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PricingChoice } from '@/lib/pricing';
import { checkoutHref } from '@/lib/pricing';

export function PricingCard({
  choice,
  featured = false,
}: {
  choice: PricingChoice;
  featured?: boolean;
}) {
  return (
    <article
      className={`flex min-h-[430px] flex-col p-7 ${featured ? 'border border-[#a95738] bg-[#20211e] text-white shadow-[0_18px_45px_rgba(35,28,22,.16)]' : 'border border-stone-300 bg-[#f8f5ee]'}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-[.16em]">
          {choice.name}
        </p>
        {featured && (
          <span className="rounded-md bg-[#a95738] px-3 py-1 text-[9px] font-bold uppercase tracking-[.12em]">
            Most popular
          </span>
        )}
      </div>
      <p className="mt-6 font-serif text-6xl tracking-[-.06em]">
        ${choice.price}
        <span className="ml-1 font-sans text-sm tracking-normal opacity-50">
          /{choice.interval === 'month' ? 'mo' : 'once'}
        </span>
      </p>
      <p className="mt-4 text-sm leading-6 opacity-60">{choice.description}</p>
      <div
        className={`my-7 h-px ${featured ? 'bg-white/15' : 'bg-stone-300'}`}
      />
      <p className="text-2xl font-semibold">
        {choice.credits.toLocaleString()}{' '}
        <span className="text-sm font-normal opacity-50">credits</span>
      </p>
      <ul className="mt-6 space-y-3 text-sm opacity-80">
        {[
          'Private organization workspace',
          'Ready asset collection',
          'Background generation workflow',
        ].map((feature) => (
          <li key={feature} className="flex items-center gap-2">
            <Check size={14} />
            {feature}
          </li>
        ))}
      </ul>
      <Button
        asChild
        variant={featured ? 'outline' : 'default'}
        className={`mt-auto h-11 ${featured ? 'border-white/30 bg-white text-stone-950' : ''}`}
      >
        <Link href={checkoutHref(choice)}>Choose {choice.name}</Link>
      </Button>
    </article>
  );
}

export function CreditPackageCard({ choice }: { choice: PricingChoice }) {
  return (
    <article className="flex items-center justify-between gap-5 border border-stone-300 bg-white/50 p-5 transition hover:-translate-y-1 hover:bg-white">
      <div className="flex items-center gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-[#dfd4c3]">
          <ShoppingBag size={17} />
        </span>
        <div>
          <p className="text-sm font-bold">
            {choice.credits.toLocaleString()} credits
          </p>
          <p className="mt-1 text-xs text-stone-500">{choice.name}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-serif text-2xl">${choice.price}</p>
        <Link
          href={checkoutHref(choice)}
          className="text-[10px] font-bold uppercase tracking-[.12em] text-terracotta"
        >
          Select
        </Link>
      </div>
    </article>
  );
}
