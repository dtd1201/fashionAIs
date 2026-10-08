import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function AdminHeader({ title, description, actions }: { title: string; description: string; eyebrow?: string; actions?: ReactNode }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">{description}</p></div>{actions}</header>;
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-gray-200 bg-white shadow-sm shadow-gray-950/[0.02] ${className}`}>{children}</section>;
}

export function PanelHeader({ title, description }: { title: string; description?: string }) {
  return <div className="border-b border-gray-100 px-5 py-4"><h2 className="text-sm font-semibold text-gray-900">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-gray-500">{description}</p>}</div>;
}

export function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <Panel className="p-5"><p className="text-sm font-medium text-gray-500">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-gray-950">{value}</p></Panel>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }) {
  const tones = { neutral: 'bg-gray-100 text-gray-700', success: 'bg-emerald-50 text-emerald-700', warning: 'bg-amber-50 text-amber-700', danger: 'bg-red-50 text-red-700', info: 'bg-blue-50 text-blue-700' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string | null }) {
  const value = status ?? 'Unknown';
  const normalized = value.toUpperCase();
  const tone = ['ACTIVE', 'COMPLETED', 'SUCCEEDED', 'READY', 'OK', 'CONFIGURED'].includes(normalized) ? 'success' : ['FAILED', 'SUSPENDED', 'CANCELLED', 'UNPAID', 'ERROR'].includes(normalized) ? 'danger' : ['PROCESSING', 'QUEUED', 'PENDING', 'PAST_DUE', 'CANCEL_REQUESTED'].includes(normalized) ? 'warning' : 'neutral';
  return <Badge tone={tone}>{value.replaceAll('_', ' ')}</Badge>;
}

export function Loading() {
  return <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading"><span className="sr-only">Loading</span>{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-gray-200 bg-white" />)}</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div role="alert" className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>;
}

export function Empty({ children = 'No records found.' }: { children?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-6 py-12 text-center"><span className="grid h-10 w-10 place-items-center rounded-full bg-gray-100 text-gray-400"><Inbox size={18} /></span><p className="mt-3 text-sm text-gray-500">{children}</p></div>;
}

export const inputClass = 'h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15';
export const tableClass = 'w-full text-left text-sm';
export const tableHeadClass = 'border-b border-gray-200 bg-gray-50/80 text-xs font-medium text-gray-500';
export const tableRowClass = 'border-b border-gray-100 transition last:border-0 hover:bg-gray-50/60';
export const tableCellClass = 'px-5 py-4 align-middle';
export const linkClass = 'font-medium text-blue-600 hover:text-blue-700 hover:underline';
