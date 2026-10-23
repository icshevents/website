import {handleStripeMembershipWebhook} from '@/lib/membership-payments/server';
import {handleWebsiteStripeWebhook} from '@/lib/payments/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return await handleWebsiteStripeWebhook(request.clone())??handleStripeMembershipWebhook(request);}
