'use client';

import type { BillingSelectionId, CreateBillingCheckoutSessionResponse } from '@fashion-ais/types';
import { LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { CheckoutSummary } from '@/components/pricing/checkout-summary';
import { Button } from '@/components/ui/button';
import { findPricingChoice, PRICING_PLANS } from '@/lib/pricing';

export default function CheckoutPage() {
  return <Suspense fallback={<main className="landing-shell py-24">Loading checkout...</main>}><CheckoutContent /></Suspense>;
}

function CheckoutContent() {
  const params = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const choice = findPricingChoice(params.get('selection')) ?? PRICING_PLANS[1];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canPurchase = auth.currentRole === 'OWNER' || auth.currentRole === 'ADMIN';

  async function continueToPayment(): Promise<void> {
    const returnTo = `/checkout?selection=${encodeURIComponent(choice.id)}`;
    if (auth.status !== 'authenticated') {
      router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (!auth.currentOrganization || !canPurchase) return;
    setLoading(true);
    setError('');
    try {
      const result = await auth.request<CreateBillingCheckoutSessionResponse>(
        `/organizations/${auth.currentOrganization.id}/billing/checkout-session`,
        { method: 'POST', body: JSON.stringify({ selectionId: choice.id as BillingSelectionId }) },
      );
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start checkout');
      setLoading(false);
    }
  }

  const disabled = auth.status === 'loading' || (auth.status === 'authenticated' && (auth.organizationStatus !== 'ready' || !canPurchase));
  return <main className="landing-shell py-16 lg:py-24"><div className="mb-12"><p className="eyebrow text-terracotta">Secure checkout</p><h1 className="mt-4 font-serif text-5xl tracking-[-.04em]">Complete your selection</h1><p className="mt-3 text-sm text-stone-500">Payment details are collected securely on Stripe Checkout.</p></div><div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr]"><CheckoutSummary choice={choice} /><section className="border border-stone-300 bg-white/60 p-7 lg:p-10"><h2 className="font-serif text-3xl">Account & payment</h2><div className="mt-8 space-y-6"><label className="block text-xs font-bold">Account email<input disabled value={auth.user?.email ?? ''} placeholder="Sign in to continue" className="checkout-input mt-2" /></label><div className="grid grid-cols-2 gap-4"><label className="block text-xs font-bold">Billing interval<select className="checkout-input mt-2" value={choice.interval ?? 'one-time'} disabled><option value="month">Monthly</option><option value="one-time">One time</option></select></label><label className="block text-xs font-bold">Currency<select className="checkout-input mt-2" disabled><option>USD</option></select></label></div><div><p className="text-xs font-bold">Payment method</p><div className="mt-2 grid min-h-36 place-items-center rounded-xl border border-dashed border-stone-300 bg-[#f8f5ee] text-center"><div><LockKeyhole className="mx-auto text-stone-400" size={24} /><p className="mt-3 text-sm font-semibold">Stripe-hosted payment</p><p className="mt-1 text-xs text-stone-500">FashionAIs never receives your full card details.</p></div></div></div>{auth.status === 'authenticated' && auth.organizationStatus === 'ready' && !canPurchase && <p className="text-sm text-red-700">Only organization owners and admins can purchase credits.</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<Button onClick={() => void continueToPayment()} disabled={disabled || loading} className="h-12 w-full">{loading ? 'Opening Stripe...' : auth.status === 'anonymous' ? 'Sign in to continue' : 'Continue to Stripe'}</Button><p className="text-center text-[10px] leading-5 text-stone-500">Credits are added only after a verified Stripe webhook confirms payment.</p></div></section></div><Link href="/pricing" className="mt-8 inline-block text-xs font-bold uppercase tracking-[.14em]">← Back to pricing</Link></main>;
}
