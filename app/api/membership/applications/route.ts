import { runMembershipApplications } from '@/lib/membership-applications/server';
import {after} from 'next/server';
import {reconcileFreeMemberships} from '@/lib/membership-activation/server';
import {scheduleFormEmails} from '@/lib/form-emails/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
// Bounded recovery of previously saved free applications if a response was interrupted.
export async function GET(request:Request){const response=await runMembershipApplications(request);if(response.ok)after(async()=>{try{await reconcileFreeMemberships();}catch{console.error('ICSH_FREE_MEMBERSHIP_RECOVERY_PENDING');}});return response;}
export async function POST(request:Request){return scheduleFormEmails(request,await runMembershipApplications(request));}

