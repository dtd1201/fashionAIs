import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminAuthProvider } from '@/components/admin-auth-provider';
import './globals.css';

export const metadata: Metadata = { title: { default: 'FashionAIs Ops', template: '%s | FashionAIs Ops' }, robots: { index: false, follow: false } };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body className="font-mono antialiased"><AdminAuthProvider>{children}</AdminAuthProvider></body></html>;
}
