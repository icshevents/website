import { createHmac } from 'node:crypto';
import { MemberSearchInputError, parseMemberSearch, type MemberSearchInput, type MemberSearchResult } from './member-search.ts';

export type MemberSearchDependencies = {
  secret: string;
  rateLimit: (key: string, maximum: number) => Promise<boolean>;
  lookup: (input: MemberSearchInput) => Promise<MemberSearchResult>;
};
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const reply = (value: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(value, { status, headers: { ...headers, ...extra } });
export async function handleMemberSearch(request: Request, deps: MemberSearchDependencies): Promise<Response> {
  try {
    if (request.method !== 'POST') return reply({ error: 'Use the member search form.' }, 405, { Allow: 'POST' });
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Open the search form on the ICSH website.' }, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'The search could not be read.' }, 415);
    if (deps.secret.length < 32) throw new Error('Search setup unavailable');
    const address = (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
    const key = createHmac('sha256', deps.secret).update(`icsh-member-search:${address}`).digest('hex');
    if (!await deps.rateLimit('member-search:' + key, 15) || !await deps.rateLimit('member-search:global', 500)) return reply({ error: 'Too many searches. Please wait ten minutes and try again.' }, 429, { 'Retry-After': '600' });
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Enter your search details.' }, 400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 2_000) { await reader.cancel(); return reply({ error: 'The search is too long.' }, 413); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return reply({ error: 'Enter your search details and try again.' }, 400); }
    const input = parseMemberSearch(body);
    const result = await deps.lookup(input);
    // A second allowlist at the public boundary prevents accidental CRM leaks.
    if (result.status === 'found') return reply({ status: result.status, membershipDate: result.membershipDate, membershipExpiry: result.membershipExpiry, daysUntilExpiry: result.daysUntilExpiry });
    if (result.status === 'expired') return reply({ status: result.status, membershipExpiry: result.membershipExpiry });
    if (!['not_found', 'ambiguous', 'dates_unavailable'].includes(result.status)) throw new Error('Invalid lookup result');
    return reply({ status: result.status });
  } catch (error) {
    if (error instanceof MemberSearchInputError) return reply({ error: error.message }, 400);
    return reply({ error: 'Member search is temporarily unavailable. Please try again later or contact ICSH.' }, 503);
  }
}
