import {handleDonations} from '@/lib/payments/server';
import {scheduleFormEmails} from '@/lib/form-emails/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=handleDonations;
export async function POST(request:Request){return scheduleFormEmails(request,await handleDonations(request));}
