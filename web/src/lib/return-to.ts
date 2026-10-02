export function safeReturnTo(value: string | null, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
