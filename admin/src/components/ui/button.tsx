import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { asChild?: boolean }

export function Button({ className, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn('inline-flex h-11 items-center justify-center rounded-lg bg-cyan-300 px-5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50', className)} {...props} />;
}
