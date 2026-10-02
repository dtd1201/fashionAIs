'use client';

import type { BillingSummaryView } from '@fashion-ais/types';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Field, SettingsCard, SettingsTitle } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { canManageOrganization } from '@/lib/settings';

export default function BillingSettingsPage() {
  const { currentOrganization, currentRole, request } = useAuth();
  const [summary, setSummary] = useState<BillingSummaryView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { if (!currentOrganization) return; let active = true; void request<BillingSummaryView>(`/organizations/${currentOrganization.id}/billing`).then((value) => { if (active) setSummary(value); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load billing.'); }); return () => { active = false; }; }, [currentOrganization, request]);
  const canPurchase = canManageOrganization(currentRole);
  return <><SettingsTitle eyebrow="Plans & payments" title="Billing" description="Subscription state comes from verified backend billing records. Checkout never changes credits until Stripe webhooks are reconciled." />{error && <p role="alert" className="mb-5 border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</p>}<SettingsCard>{!summary ? <p className="text-sm text-stone-500">Loading billing status...</p> : <div className="grid gap-8 md:grid-cols-[1fr_auto]"><dl><Field label="Subscription" value={summary.subscriptionPlan ? summary.subscriptionPlan.charAt(0).toUpperCase() + summary.subscriptionPlan.slice(1) : 'No active plan'} /><Field label="Status" value={summary.subscriptionStatus?.replace('_', ' ') ?? 'Not subscribed'} /><Field label="Current period ends" value={summary.currentPeriodEnd ? new Date(summary.currentPeriodEnd).toLocaleDateString() : 'Not available'} /><Field label="Renewal" value={summary.cancelAtPeriodEnd ? 'Cancels at period end' : summary.subscriptionStatus === 'ACTIVE' ? 'Renews automatically' : 'Not scheduled'} /><Field label="Credit balance" value={`${summary.creditBalance.toLocaleString()} credits`} /></dl><div className="md:w-64">{!summary.billingConfigured ? <div className="border border-amber-300 bg-amber-50 p-5"><p className="text-sm font-bold text-amber-950">Billing is unavailable</p><p className="mt-2 text-xs leading-5 text-amber-900">Stripe is not configured for this environment. No payment attempt has been made.</p></div> : canPurchase ? <div className="border border-stone-300 bg-[#f8f5ee] p-5"><p className="text-sm font-bold">Manage credits or plan</p><p className="mt-2 text-xs leading-5 text-stone-500">Choose a plan or top-up, then continue through the existing Stripe checkout flow.</p><Button asChild className="mt-5 w-full"><Link href="/pricing">View options</Link></Button></div> : <div className="border border-stone-300 bg-[#f8f5ee] p-5"><p className="text-sm font-bold">Read-only billing</p><p className="mt-2 text-xs leading-5 text-stone-500">Only organization owners and admins can start checkout.</p></div>}</div></div>}</SettingsCard></>;
}
