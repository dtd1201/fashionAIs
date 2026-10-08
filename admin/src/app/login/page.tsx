'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useAdminAuth } from '@/components/admin-auth-provider';
import { Button } from '@/components/ui/button';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, status } = useAdminAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      await login({ email: String(form.get('email')), password: String(form.get('password')) });
      router.replace('/admin');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gray-50 p-6">
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-xl shadow-gray-900/[0.05] sm:p-10">
        <p className="text-base font-semibold tracking-tight text-gray-950">FashionAIs Admin</p>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-gray-950">Sign in to Admin</h1>
        <p className="mt-2 text-sm text-gray-500">Use your system administrator account</p>
        <form onSubmit={submit} className="mt-7 space-y-5">
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <Field label="Password" name="password" type="password" autoComplete="current-password" />
          {(error || status === 'denied') && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error || 'This account does not have system administrator access.'}</p>}
          <Button className="w-full" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</Button>
        </form>
      </section>
    </main>
  );
}

function Field(props: { label: string; name: string; type: string; autoComplete: string }) {
  return <label className="block text-sm font-medium text-gray-700">{props.label}<input {...props} required className="mt-2 h-11 w-full rounded-lg border border-gray-300 bg-white px-3.5 text-sm text-gray-950 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15" /></label>;
}
