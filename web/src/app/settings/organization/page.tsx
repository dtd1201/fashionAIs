'use client';

import type { OrganizationDetail } from '@fashion-ais/types';
import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Field, SettingsCard, SettingsTitle } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { canManageOrganization } from '@/lib/settings';

export default function OrganizationSettingsPage() {
  const { currentOrganization, currentRole, request } = useAuth();
  const [name, setName] = useState(currentOrganization?.name ?? '');
  const [savedName, setSavedName] = useState(currentOrganization?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!currentOrganization) return <p className="text-sm text-stone-500">No organization is available for this account.</p>;
  const editable = canManageOrganization(currentRole);
  async function save(): Promise<void> {
    if (!name.trim()) return;
    setBusy(true); setMessage('');
    try { const updated = await request<OrganizationDetail>(`/organizations/${currentOrganization!.id}`, { method: 'PATCH', body: JSON.stringify({ name: name.trim() }) }); setName(updated.name); setSavedName(updated.name); setMessage('Organization name updated.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update organization.'); }
    finally { setBusy(false); }
  }
  return <><SettingsTitle eyebrow="Workspace identity" title="Organization" description={editable ? 'Owners and admins can update the organization name.' : 'Your membership is read-only. Ask an owner or admin to make changes.'} /><SettingsCard><div className="grid gap-8 md:grid-cols-[1.2fr_.8fr]"><div><label className="text-[10px] font-bold uppercase tracking-[.14em] text-stone-400">Organization name</label><input className="studio-input mt-2 h-12" value={name} disabled={!editable} maxLength={120} onChange={(event) => setName(event.target.value)} />{editable && <Button className="mt-4" disabled={busy || !name.trim() || name.trim() === savedName} onClick={() => void save()}>{busy ? 'Saving...' : 'Save name'}</Button>}{message && <p role="status" className="mt-3 text-xs text-stone-600">{message}</p>}</div><dl><Field label="Role" value={currentRole} /><Field label="Created" value={new Date(currentOrganization.createdAt).toLocaleDateString()} /><Field label="Workspace slug" value={currentOrganization.slug} /></dl></div></SettingsCard></>;
}
