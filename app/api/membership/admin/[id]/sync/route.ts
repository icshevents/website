import { runMembershipAdmin } from '@/lib/membership-applications/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return runMembershipAdmin(request, (await params).id);
}

