export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function assetDisplayName(fileName: string, source?: string | null): string {
  const stem = fileName.replace(/\.[^.]+$/, '').trim();
  const looksGenerated = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(stem)
    || /^[0-9a-f]{20,}$/i.test(stem);
  if (looksGenerated) return source === 'GENERATED' ? 'Generated look' : 'Untitled image';
  return stem || (source === 'GENERATED' ? 'Generated look' : 'Untitled image');
}

export function statusTone(status: string): string {
  if (status === 'COMPLETED' || status === 'READY') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'FAILED' || status === 'CANCELLED') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-stone-300 bg-white/70 text-stone-700';
}
