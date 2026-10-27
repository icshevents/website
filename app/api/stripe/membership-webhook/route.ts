import {handleStripeMembershipWebhook} from '@/lib/membership-payments/server';
import {handleWebsiteStripeWebhook} from '@/lib/payments/server';
import {scheduleFormEmails} from '@/lib/form-emails/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){return scheduleFormEmails(request,await handleWebsiteStripeWebhook(request.clone())??await handleStripeMembershipWebhook(request));}
