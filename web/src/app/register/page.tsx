'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type MouseEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { AuthField, AuthShell } from '@/components/auth-shell';
import { safeReturnTo } from '@/lib/return-to';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  function continueToLogin(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    const returnTo = safeReturnTo(
      new URLSearchParams(window.location.search).get('returnTo'),
    );
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
      router.replace(
        safeReturnTo(
          new URLSearchParams(window.location.search).get('returnTo'),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to create account',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="New workspace"
      title="Create your studio."
      description="Set up your private FashionAIs organization and begin with virtual try-on."
      footer={
        <>
          Already registered?{' '}
          <Link
            className="font-bold text-stone-950 underline decoration-stone-300 underline-offset-4"
            href="/login"
            onClick={continueToLogin}
          >
            Sign in
          </Link>
        </>
      }
    >
      <form
        onSubmit={submit}
        className="surface-card mt-9 space-y-4 p-6 sm:p-8"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <AuthField label="Your name" name="displayName" autoComplete="name" />
          <AuthField
            label="Organization"
            name="organizationName"
            autoComplete="organization"
          />
        </div>
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
          autoComplete="new-password"
          minLength={12}
          hint="Use at least 12 characters."
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
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  );
}
