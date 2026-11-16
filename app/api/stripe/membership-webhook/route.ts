import {scheduleTicketEmails} from '@/lib/ticket-emails/server';
import {handleStripeMembershipWebhook} from '@/lib/membership-payments/server';
import {handleWebsiteStripeWebhook} from '@/lib/payments/server';
import {scheduleFormEmails} from '@/lib/form-emails/server';
import {handleIftariWebhook} from '@/lib/iftari/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){return scheduleTicketEmails(request,scheduleFormEmails(request,await handleIftariWebhook(request.clone())??await handleWebsiteStripeWebhook(request.clone())??await handleStripeMembershipWebhook(request)));}
