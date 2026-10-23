import { createEventService } from '@/lib/event-forms/service';
import { handleMembershipEligibility } from '@/lib/membership-eligibility-api';
import { checkMembershipEligibility } from '@/lib/membership-eligibility';
import { searchBiginMembershipRecords } from '@/lib/zoho/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
export async function POST(request: Request) {
  return handleMembershipEligibility(request, {
    secret: process.env.SUPABASE_SECRET_KEY ?? '',
    rateLimit: async (key, maximum) => {
      const { data, error } = await createEventService().rpc('icsh_event_rate_limit', { p_key: key, p_max: maximum });
      if (error) throw new Error('Membership check unavailable');
      return data === true;
    },
    check: identity => checkMembershipEligibility(identity, searchBiginMembershipRecords),
  });
}
