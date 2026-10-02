'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BuyCreditsModal({ required, available, onClose }: { required: number; available: number; onClose(): void }) {
  return <div role="presentation" className="fixed inset-0 z-[80] grid place-items-center bg-stone-950/50 p-4 backdrop-blur-sm" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-labelledby="credits-title" className="w-full max-w-md rounded-2xl bg-[#f8f5ee] p-7 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="studio-label text-terracotta">Generation credits</p><h2 id="credits-title" className="mt-2 font-serif text-4xl">More credits needed</h2></div><button aria-label="Close" onClick={onClose} className="rounded-full p-2 hover:bg-stone-200"><X size={18} /></button></div><p className="mt-4 text-sm leading-6 text-stone-600">Your organization shares one credit balance. Add credits before starting this generation.</p><dl className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white p-4"><dt className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Required</dt><dd className="mt-2 text-2xl font-bold">{required}</dd></div><div className="rounded-xl bg-white p-4"><dt className="text-[10px] font-bold uppercase tracking-[.12em] text-stone-400">Available</dt><dd className="mt-2 text-2xl font-bold">{available}</dd></div></dl><Button asChild className="mt-7 h-11 w-full"><Link href="/pricing">Buy credits</Link></Button><button onClick={onClose} className="mt-3 w-full py-2 text-xs font-semibold text-stone-500">Keep editing</button></section></div>;
}
