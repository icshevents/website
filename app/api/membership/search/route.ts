import { createEventService } from '@/lib/event-forms/service';
import { handleMemberSearch } from '@/lib/member-search-api';
import { lookupBiginMembership } from '@/lib/zoho/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function POST(request: Request) {
  return handleMemberSearch(request, {
    secret: process.env.SUPABASE_SECRET_KEY ?? '',
    rateLimit: async (key, maximum) => {
      const db = createEventService();
      const { data, error } = await db.rpc('icsh_event_rate_limit', { p_key: key, p_max: maximum });
      if (error) throw new Error('Member search protection unavailable');
      return data === true;
    },
    lookup: lookupBiginMembership,
  });
}
