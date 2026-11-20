import { WebsiteStripeClient, type Source } from '../payments/core.ts';
import type { Attendee, Quote, Settings } from './core.ts';

export const iftariPurpose = 'icsh_iftari_booking_v1';
export type BookingRow = {
  id: string; event_slug: string; request_hash: string; capability_hash: string;
  reference: string; contact: { firstName: string; lastName: string; email: string; mobile: string; notes?: string; attendees?:Attendee[] };
  member_emails: string[]; quantities: { member: number; nonmember: number; child: number; under5: number };
  event_snapshot: Settings; quote: Quote; total: number; mode: 'test' | 'live'; account_id: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'refunded' | 'partially_refunded' | 'disputed';
  session_id: string | null; payment_intent_id: string | null; charge_id: string | null;
  paid_at: string | null; refunded_amount: number; needs_review: boolean; created_at: string; checkout_expires: number;
};
export function bookingSource(b: BookingRow): Source {
  return { kind: 'event', id: b.id, mode: b.mode, amount: b.total, currency: 'gbp', reference: b.reference,
    description: b.event_snapshot.title, email: b.contact.email, capabilityHash: b.capability_hash, eligible: b.status === 'pending' };
}
/** Uses ICSH's existing account guard, Stripe transport and payment-evidence validation. */
export class IftariStripeClient extends WebsiteStripeClient {
  async createBooking(b: BookingRow) {
    if (b.status !== 'pending' || b.mode !== this.config.mode || b.account_id !== this.config.account || b.total < 30) throw new Error('Checkout unavailable');
    await this.client.verifyAccount();
    const returnUrl = `${this.config.origin}/ramadan-iftari-2027/confirmation?id=${b.id}`;
    const params = new URLSearchParams({ mode: 'payment', client_reference_id: b.id, customer_email: b.contact.email,
      success_url: returnUrl, cancel_url: returnUrl, expires_at: String(b.checkout_expires),
      'metadata[purpose]': iftariPurpose, 'metadata[booking_id]': b.id, 'metadata[account_id]': this.config.account,
      'payment_intent_data[metadata][purpose]': iftariPurpose, 'payment_intent_data[metadata][booking_id]': b.id,
      integration_identifier: 'icsh_iftari_checkout_znqvrmpt', 'adaptive_pricing[enabled]': 'false',
    });
    // Stripe's price_data cannot contain negative line items. The verified
    // booking stores original category prices; Stripe charges one net ticket
    // amount plus the unchanged optional donation.
    const promotion=b.quote.promotion;
    if(promotion){
      const admissions=b.quote.tickets-promotion.discountPence;
      if(admissions<0||admissions+b.quote.donation!==b.total||promotion.payablePence!==b.total)throw Error('Iftari discount total does not reconcile.');
      const discountedLines=[
        ...(admissions>0?[{key:'tickets',quantity:1,unitAmount:admissions,label:b.event_snapshot.title+' – Tickets after '+promotion.code}]:[]),
        ...(b.quote.donation>0?[{key:'donation',quantity:1,unitAmount:b.quote.donation,label:'Optional ICSH Donation'}]:[])
      ];
      discountedLines.forEach((line,i)=>{
        params.set(`line_items[${i}][quantity]`,String(line.quantity));
        params.set(`line_items[${i}][price_data][currency]`,'gbp');
        params.set(`line_items[${i}][price_data][unit_amount]`,String(line.unitAmount));
        params.set(`line_items[${i}][price_data][product_data][name]`,line.label);
      });
      params.set('metadata[discount_code]',promotion.code);
      params.set('metadata[original_total_pence]',String(promotion.grossPence));
      params.set('metadata[discount_pence]',String(promotion.discountPence));
      params.set('payment_intent_data[metadata][discount_code]',promotion.code);
      params.set('payment_intent_data[metadata][discount_pence]',String(promotion.discountPence));
    }else{
      b.quote.lines.forEach((line, i) => {
        params.set(`line_items[${i}][quantity]`, String(line.quantity));
        params.set(`line_items[${i}][price_data][currency]`, 'gbp');
        params.set(`line_items[${i}][price_data][unit_amount]`, String(line.unitAmount));
        params.set(`line_items[${i}][price_data][product_data][name]`, line.key === 'donation' ? line.label : `${b.event_snapshot.title} – ${line.label}`);
      });
    }
    const session = await this.client.request('/checkout/sessions', params, `icsh-iftari-v1-${b.account_id}-${b.mode}-${b.id}`);
    this.validate(session, bookingSource(b));
    return session;
  }
  override validate(v: Record<string, any>, s: Source) {
    if (v.metadata?.purpose !== iftariPurpose || v.metadata?.booking_id !== s.id) throw new Error('Iftari checkout mismatch');
    super.validate({ ...v, metadata: { ...v.metadata, purpose: 'icsh_website_payment_v1', source_kind: 'event', source_id: s.id } }, s);
  }
}
