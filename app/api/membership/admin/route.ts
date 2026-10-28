import { runMembershipAdmin } from '@/lib/membership-applications/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return runMembershipAdmin(request); }

