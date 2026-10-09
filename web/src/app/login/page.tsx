'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type MouseEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { AuthField, AuthShell } from '@/components/auth-shell';
import { safeReturnTo } from '@/lib/return-to';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  function continueToRegister(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    const returnTo = safeReturnTo(
      new URLSearchParams(window.location.search).get('returnTo'),
    );
    router.push(`/register?returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError('');
    try {
      await login({
        email: String(form.get('email')),
        password: String(form.get('password')),
      });
      router.replace(
        safeReturnTo(
          new URLSearchParams(window.location.search).get('returnTo'),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Return to your studio."
      description="Sign in to continue creating and access your organization workspace."
      footer={
        <>
          New here?{' '}
          <Link
            className="font-bold text-stone-950 underline decoration-stone-300 underline-offset-4"
            href="/register"
            onClick={continueToRegister}
          >
            Create an account
          </Link>
        </>
      }
    >
      <form
        onSubmit={submit}
        className="surface-card mt-9 space-y-5 p-6 sm:p-8"
      >
        <AuthField
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
        {error && (
          <p
            role="alert"
            className="border-l-2 border-red-700 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <Button className="h-12 w-full" disabled={loading} aria-busy={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  );
}
