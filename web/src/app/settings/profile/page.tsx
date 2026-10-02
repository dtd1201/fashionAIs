'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Field, SettingsCard, SettingsTitle } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { signOutAccount } from '@/lib/settings';

export default function ProfileSettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  async function signOut(): Promise<void> { await signOutAccount(logout, () => router.replace('/login')); }
  return <><SettingsTitle eyebrow="Personal account" title="Profile" description="Your authenticated FashionAIs identity. Account fields are read-only until profile editing is supported." /><SettingsCard><dl><Field label="Email address" value={user.email} /><Field label="Display name" value={user.displayName || 'Not set'} /><Field label="Account status" value={user.status.charAt(0) + user.status.slice(1).toLowerCase()} /></dl><div className="mt-8 border-t border-stone-200 pt-6"><Button variant="outline" onClick={() => void signOut()}>Sign out</Button></div></SettingsCard></>;
}
