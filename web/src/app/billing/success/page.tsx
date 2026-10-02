'use client';

import type { BillingCheckoutSessionView, BillingSummaryView } from '@fashion-ais/types';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';

export default function BillingSuccessPage() {
  return <Suspense fallback={<main className="landing-shell py-24">Checking payment status...</main>}><BillingSuccessContent /></Suspense>;
}

function BillingSuccessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const sessionId = params.get('session_id');
  const [session, setSession] = useState<BillingCheckoutSessionView | null>(null);
  const [summary, setSummary] = useState<BillingSummaryView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (auth.status === 'anonymous') {
      router.replace(`/login?returnTo=${encodeURIComponent(`/billing/success?session_id=${sessionId ?? ''}`)}`);
      return;
    }
    if (auth.status !== 'authenticated' || auth.organizationStatus !== 'ready' || !auth.currentOrganization || !sessionId) return;
    let active = true;
    let attempts = 0;
    const organizationId = auth.currentOrganization.id;

    async function refresh(): Promise<void> {
      try {
        const nextSession = await auth.request<BillingCheckoutSessionView>(`/organizations/${organizationId}/billing/checkout-session/${encodeURIComponent(sessionId!)}`);
        const nextSummary = await auth.request<BillingSummaryView>(`/organizations/${organizationId}/billing`);
        if (!active) return;
        setSession(nextSession);
        setSummary(nextSummary);
        if (nextSession.status !== 'COMPLETED' && attempts++ < 8) window.setTimeout(() => void refresh(), 1500);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to check payment status');
      }
    }
    void refresh();
    return () => { active = false; };
  }, [auth, router, sessionId]);

  const confirmed = session?.status === 'COMPLETED';
  return <main className="landing-shell grid min-h-[70vh] place-items-center py-20"><section className="w-full max-w-2xl border border-stone-300 bg-[#f8f5ee] p-8 text-center lg:p-14">{confirmed ? <CheckCircle2 className="mx-auto text-emerald-700" size={44} /> : <LoaderCircle className="mx-auto animate-spin text-terracotta" size={44} />}<p className="eyebrow mt-7 justify-center text-terracotta">Billing status</p><h1 className="mt-4 font-serif text-5xl tracking-[-.04em]">{confirmed ? 'Payment confirmed' : 'Payment processing'}</h1><p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-stone-600">{confirmed ? `Your verified payment has been processed. Current balance: ${summary?.creditBalance ?? 0} credits.` : 'Stripe redirected you successfully. We are waiting for the verified webhook before updating billing or credits.'}</p>{error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}<div className="mt-9 flex justify-center gap-3"><Button asChild><Link href="/studio">Return to Studio</Link></Button><Button asChild variant="outline"><Link href="/pricing">View pricing</Link></Button></div></section></main>;
}
