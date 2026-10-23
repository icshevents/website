import {handleDonations} from '@/lib/payments/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=handleDonations;
export const POST=handleDonations;
