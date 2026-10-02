'use client';

import { LockKeyhole } from 'lucide-react';
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
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-6">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(103,232,249,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(103,232,249,.06)_1px,transparent_1px)] bg-[size:42px_42px]" />
      <section className="relative w-full max-w-md border border-slate-700 bg-slate-950/90 p-8 shadow-2xl shadow-cyan-950/40 backdrop-blur sm:p-10">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-300 text-slate-950"><LockKeyhole size={20} /></div>
        <p className="mt-8 text-xs font-bold uppercase tracking-[.25em] text-cyan-300">Restricted system</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Operations access</h1>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <Field label="Password" name="password" type="password" autoComplete="current-password" />
          {(error || status === 'denied') && <p role="alert" className="text-sm text-rose-300">{error || 'This account does not have system administrator access.'}</p>}
          <Button className="w-full" disabled={loading}>{loading ? 'Verifying...' : 'Sign in'}</Button>
        </form>
      </section>
    </main>
  );
}

function Field(props: { label: string; name: string; type: string; autoComplete: string }) {
  return <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">{props.label}<input {...props} required className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-normal normal-case tracking-normal text-white outline-none focus:border-cyan-300" /></label>;
}
