import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-full text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-stone-950 px-5 py-2.5 text-white hover:bg-amber-700',
        outline: 'border border-stone-300 bg-white/70 px-5 py-2.5 hover:border-stone-950',
        ghost: 'px-4 py-2 text-stone-600 hover:bg-stone-200/70 hover:text-stone-950',
        danger: 'bg-red-950 px-5 py-2.5 text-white hover:bg-red-800',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, asChild, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  return <Component className={cn(buttonVariants({ variant }), className)} {...props} />;
}
