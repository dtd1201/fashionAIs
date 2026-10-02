'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type MouseEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { safeReturnTo } from '@/lib/return-to';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  function continueToLogin(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
    router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      await register({
        email: String(form.get('email')),
        password: String(form.get('password')),
        displayName: String(form.get('displayName')),
        organizationName: String(form.get('organizationName')),
      });
      router.replace(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create account');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="font-serif text-4xl font-black">Create your studio</h1>
      <p className="mt-2 text-stone-600">Your first organization is created automatically.</p>
      <form onSubmit={submit} className="mt-8 space-y-4 rounded-3xl border border-stone-200 bg-white/80 p-7">
        <Field label="Name" name="displayName" autoComplete="name" />
        <Field label="Organization" name="organizationName" autoComplete="organization" />
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={12} />
        <p className="text-xs text-stone-500">Use at least 12 characters.</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button className="w-full" disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</Button>
      </form>
      <p className="mt-5 text-sm text-stone-600">Already registered? <Link className="font-bold text-stone-950" href="/login" onClick={continueToLogin}>Sign in</Link></p>
    </main>
  );
}

function Field(props: { label: string; name: string; type?: string; autoComplete: string; minLength?: number }) {
  return <label className="block text-sm font-semibold">{props.label}<input {...props} required className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-normal outline-none focus:border-amber-700" /></label>;
}
