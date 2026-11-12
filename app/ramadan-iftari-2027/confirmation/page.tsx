import { cookies } from 'next/headers';
import { iftariBooking, iftariCookie, publicBooking } from '@/lib/iftari/server';
import { readPaymentReturnCookie } from '@/lib/membership-payments/core';
import Receipt, { type ReceiptBooking } from './Receipt';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Iftari booking confirmation', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default async function Confirmation({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const id = (await searchParams).id || '';
  let booking: ReceiptBooking | null = null;
  if (/^[a-f0-9-]{36}$/.test(id)) {
    const proof = readPaymentReturnCookie((await cookies()).get(iftariCookie + '-' + id)?.value || '', process.env.SUPABASE_SECRET_KEY || '');
    try { if (proof?.id === id) { const row = await iftariBooking(id, proof.capability); if (row) booking = publicBooking(row); } } catch { /* Protected read only; a return URL never confirms payment. */ }
  }
  return <section className="section white"><Receipt id={id} initial={booking} /></section>;
}
