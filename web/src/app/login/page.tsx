'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type MouseEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { safeReturnTo } from '@/lib/return-to';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  function continueToRegister(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
    router.push(`/register?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      await login({ email: String(form.get('email')), password: String(form.get('password')) });
      router.replace(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="font-serif text-4xl font-black">Welcome back</h1>
      <p className="mt-2 text-stone-600">Sign in to your FashionAIs workspace.</p>
      <form onSubmit={submit} className="mt-8 space-y-5 rounded-3xl border border-stone-200 bg-white/80 p-7">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button className="w-full" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</Button>
      </form>
      <p className="mt-5 text-sm text-stone-600">New here? <Link className="font-bold text-stone-950" href="/register" onClick={continueToRegister}>Create an account</Link></p>
    </main>
  );
}

function Field(props: { label: string; name: string; type: string; autoComplete: string }) {
  return <label className="block text-sm font-semibold">{props.label}<input {...props} required className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 font-normal outline-none focus:border-amber-700" /></label>;
}
