'use client';

import type { CreditLedgerEntryView, CreditLedgerListResponse, CreditUsageSummaryView } from '@fashion-ais/types';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { SettingsCard, SettingsTitle } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { creditLedgerLabels } from '@/lib/settings';

export default function CreditsSettingsPage() {
  const { currentOrganization, currentRole, request } = useAuth();
  const [summary, setSummary] = useState<CreditUsageSummaryView | null>(null);
  const [items, setItems] = useState<CreditLedgerEntryView[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const canViewLedger = currentRole === 'OWNER' || currentRole === 'ADMIN';
  const load = useCallback(async () => { if (!currentOrganization) return; setLoading(true); try { const usage = await request<CreditUsageSummaryView>(`/organizations/${currentOrganization.id}/credits/usage`); setSummary(usage); if (canViewLedger) { const ledger = await request<CreditLedgerListResponse>(`/organizations/${currentOrganization.id}/credits/ledger?limit=20`); setItems(ledger.items); setNextCursor(ledger.pageInfo.nextCursor); } setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load credit usage.'); } finally { setLoading(false); } }, [canViewLedger, currentOrganization, request]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function loadMore(): Promise<void> { if (!currentOrganization || !nextCursor) return; setLoadingMore(true); try { const page = await request<CreditLedgerListResponse>(`/organizations/${currentOrganization.id}/credits/ledger?limit=20&cursor=${encodeURIComponent(nextCursor)}`); setItems((current) => [...current, ...page.items]); setNextCursor(page.pageInfo.nextCursor); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load more activity.'); } finally { setLoadingMore(false); } }
  return <><SettingsTitle eyebrow="Authoritative account" title="Credits & Usage" description="Your organization balance and server-aggregated usage. Ledger entries are append-only and ordered newest first." />{error && <p role="alert" className="mb-5 border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</p>}{loading ? <SettingsCard><p className="text-sm text-stone-500">Loading credit usage...</p></SettingsCard> : <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Balance" value={summary?.balance} accent /><Metric label="Used" value={summary?.usedCredits} /><Metric label="Refunded" value={summary?.refundedCredits} /><Metric label="Granted" value={summary?.grantedCredits} /><Metric label="Purchased" value={summary?.purchasedCredits} /></div><div className="mt-8"><h3 className="font-serif text-3xl">Credit activity</h3>{canViewLedger ? <SettingsCard className="mt-4 overflow-hidden p-0 md:p-0">{items.length === 0 ? <p className="p-8 text-sm text-stone-500">No credit activity yet.</p> : <div>{items.map((entry) => <div key={entry.id} className="grid gap-3 border-b border-stone-200 p-5 last:border-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"><div><p className="text-sm font-semibold">{creditLedgerLabels[entry.type]}</p><p className="mt-1 text-xs text-stone-500">{entry.description || new Date(entry.createdAt).toLocaleString()}</p></div><p className={`text-sm font-bold ${entry.amount >= 0 ? 'text-emerald-700' : 'text-stone-900'}`}>{entry.amount >= 0 ? '+' : ''}{entry.amount.toLocaleString()}</p><p className="text-xs text-stone-500">Balance {entry.balanceAfter.toLocaleString()}</p></div>)}</div>}{nextCursor && <div className="border-t border-stone-200 p-4 text-center"><Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading...' : 'Load more'}</Button></div>}</SettingsCard> : <SettingsCard className="mt-4"><p className="text-sm leading-6 text-stone-600">Owners and admins can view the detailed credit ledger. Your current balance and usage summary remain visible above.</p></SettingsCard>}</div></>}</>;
}

function Metric({ label, value, accent = false }: { label: string; value: number | undefined; accent?: boolean }) { return <div className={`border p-5 ${accent ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white/60'}`}><p className={`text-[9px] font-bold uppercase tracking-[.15em] ${accent ? 'text-stone-300' : 'text-stone-400'}`}>{label}</p><p className="mt-3 font-serif text-4xl">{value?.toLocaleString() ?? '—'}</p><p className={`mt-1 text-[10px] ${accent ? 'text-stone-400' : 'text-stone-500'}`}>credits</p></div>; }
