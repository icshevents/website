import { runMembershipApplications } from '@/lib/membership-applications/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = runMembershipApplications;
export const POST = runMembershipApplications;

