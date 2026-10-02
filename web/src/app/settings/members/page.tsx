'use client';

import type { OrganizationMemberView, OrganizationRole } from '@fashion-ais/types';
import { Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { SettingsCard, SettingsTitle } from '@/components/settings/settings-ui';
import { canManageMember } from '@/lib/settings';

export default function MembersSettingsPage() {
  const { user, currentOrganization, currentRole, request } = useAuth();
  const [members, setMembers] = useState<OrganizationMemberView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => { if (!currentOrganization) return; setLoading(true); try { setMembers(await request<OrganizationMemberView[]>(`/organizations/${currentOrganization.id}/members`)); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load members.'); } finally { setLoading(false); } }, [currentOrganization, request]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function changeRole(member: OrganizationMemberView, role: OrganizationRole): Promise<void> { if (!currentOrganization) return; try { await request(`/organizations/${currentOrganization.id}/members/${member.id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to change role.'); } }
  async function remove(member: OrganizationMemberView): Promise<void> { if (!currentOrganization || !window.confirm(`Remove ${member.email} from this organization?`)) return; try { await request(`/organizations/${currentOrganization.id}/members/${member.id}`, { method: 'DELETE' }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to remove member.'); } }
  return <><SettingsTitle eyebrow="Team access" title="Members" description="Review workspace access. Role changes and removals follow backend permissions and last-owner protection." />{error && <p role="alert" className="mb-5 border border-red-300 bg-red-50 p-4 text-sm text-red-800">{error}</p>}<SettingsCard className="overflow-x-auto p-0 md:p-0">{loading ? <p className="p-8 text-sm text-stone-500">Loading members...</p> : <table className="w-full min-w-[680px] text-left"><thead><tr className="border-b border-stone-300 text-[10px] uppercase tracking-[.14em] text-stone-400"><th className="p-5">Member</th><th className="p-5">Role</th><th className="p-5">Joined</th><th className="p-5 text-right">Actions</th></tr></thead><tbody>{members.map((member) => { const manageable = canManageMember(currentRole, user?.id, member); return <tr key={member.id} className="border-b border-stone-200 last:border-0"><td className="p-5"><p className="text-sm font-semibold">{member.displayName || member.email}</p>{member.displayName && <p className="mt-1 text-xs text-stone-500">{member.email}</p>}{member.userId === user?.id && <span className="mt-2 inline-block text-[9px] font-bold uppercase tracking-wider text-terracotta">You</span>}</td><td className="p-5"><select aria-label={`Role for ${member.email}`} className="studio-input w-36" value={member.role} disabled={!manageable} onChange={(event) => void changeRole(member, event.target.value as OrganizationRole)}>{(['OWNER', 'ADMIN', 'MEMBER'] as const).map((role) => <option key={role} value={role} disabled={currentRole === 'ADMIN' && role === 'OWNER'}>{role}</option>)}</select></td><td className="p-5 text-xs text-stone-500">{new Date(member.createdAt).toLocaleDateString()}</td><td className="p-5 text-right"><button aria-label={`Remove ${member.email}`} disabled={!manageable} onClick={() => void remove(member)} className="rounded-lg p-2 text-stone-400 hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={16} /></button></td></tr>; })}</tbody></table>}</SettingsCard></>;
}
