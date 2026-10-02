export interface AdminPage<T> { items: T[]; pageInfo: { hasNextPage: boolean; nextCursor: string | null } }
export function shortId(value: string): string { return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value; }
export function friendly(value: string | null | undefined): string { return value ? value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : '—'; }
export function adminRouteAllowed(status: string, isSystemAdmin: boolean | undefined): boolean { return status === 'authenticated' && isSystemAdmin === true; }
