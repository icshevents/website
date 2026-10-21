import { organiserSession } from '@/lib/supabase/server';
import { checkBiginConnection, checkCampaignsConnection, getZohoConfiguration, handleZohoCheck } from '@/lib/zoho/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  return handleZohoCheck(request, {
    session: organiserSession,
    configuration: getZohoConfiguration,
    bigin: checkBiginConnection,
    campaigns: checkCampaignsConnection,
  });
}
