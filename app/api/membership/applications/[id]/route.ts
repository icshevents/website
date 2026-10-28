import { runMembershipReceipt } from '@/lib/membership-applications/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration=120;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runMembershipReceipt(request, (await params).id);
}

