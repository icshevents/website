import {handleStripeMembershipWebhook} from '@/lib/membership-payments/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return handleStripeMembershipWebhook(request);}
