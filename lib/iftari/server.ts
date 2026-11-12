import 'server-only';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { createEventService } from '../event-forms/service.js';
import { signedPublicSession } from '../event-forms/security.js';
import { organiserSession } from '../supabase/server';
import { searchBiginMembershipRecords } from '../zoho/server';
import { membershipMobileKey } from '../membership-eligibility';
import { boundedBody } from '../payments/server';
import { websitePaymentConfiguration } from '../payments/core';
import { constantEqual, digest, paymentHeaders, paymentConfiguration, paymentRequestOrigin, paymentReturnCookie, verifyStripeEvent } from '../membership-payments/core';
import { bookingInputSchema, quoteInputSchema, settingsSchema, quoteBooking, verifyMember, verifyMemberTickets, IftariError, IFTARI_SLUG, membershipMessages } from './core';
import { IftariStripeClient, bookingSource, iftariPurpose, type BookingRow } from './stripe';

export const iftariCookie = '__Host-icsh-iftari';
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(value, { status, headers: { ...paymentHeaders, ...headers } });
export async function iftariSettings() {
  const result = await createEventService().from('icsh_iftari_settings').select('configuration').eq('slug', IFTARI_SLUG).single();
  if (result.error) throw new IftariError('The Iftari booking form is being prepared. Please try again shortly.', 503);
  return settingsSchema.parse(result.data.configuration);
}
export async function iftariBooking(id: string, capability?: string): Promise<BookingRow | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const result = await createEventService().from('icsh_iftari_bookings').select('*').eq('id', id).maybeSingle();
  if (result.error) throw new IftariError('Booking details are temporarily unavailable.', 503);
  const b = result.data as BookingRow | null;
  if (capability !== undefined && (!b || !/^[a-f0-9]{64}$/.test(capability) || !constantEqual(digest(capability), b.capability_hash))) return null;
  return b;
}
export function publicBooking(b: BookingRow) {
  return { id: b.id, reference: b.reference, event: b.event_snapshot, quantities: b.quantities, quote: b.quote,
    status: b.status, confirmed: b.status === 'paid' && !b.needs_review,
    paidAt: b.paid_at, refundedAmount: b.refunded_amount, mode: b.mode };
}
async function rate(request: Request, action: string, max: number) {
  const address = (request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'local').split(',')[0];
  const key = createHmac('sha256', process.env.SUPABASE_SECRET_KEY || '').update(`iftari:${action}:${address}`).digest('hex');
  const result = await createEventService().rpc('icsh_event_rate_limit', { p_key: key, p_max: max });
  if (result.error) throw new IftariError('The booking service is temporarily unavailable.', 503);
  if (result.data !== true) throw new IftariError('Too many attempts. Please wait ten minutes.', 429);
}
const databaseErrors: Record<string, string> = {
  P2701: 'This booking request changed. Open your saved booking, or start a new booking.',
  P2702: 'This event is not open for bookings.', P2703: 'The event settings or prices changed. Review the latest summary and try again.',
  P2704: 'Under-5 pricing is awaiting confirmation.', P2705: 'There are not enough places available for this group or capacity setting.',
  P2706: 'A member discount is already booked or reserved for one of these emails. Resume the existing booking, wait for its checkout to expire, or contact ICSH.',
};
function databaseError(error: { code?: string } | null): never {
  throw new IftariError(databaseErrors[error?.code || ''] || 'Your booking could not be saved. Retry the same booking details.', databaseErrors[error?.code || ''] ? 409 : 503);
}
async function openCheckout(request: Request, b: BookingRow, capability: string) {
  const configured = websitePaymentConfiguration(), config = configured && paymentRequestOrigin(configured, request.url);
  if (!config || b.mode !== config.mode || b.account_id !== config.account) throw new IftariError('Secure payment is temporarily unavailable. Your booking details remain saved.', 503);
  const headers = { 'Set-Cookie': `${iftariCookie}-${b.id}=${paymentReturnCookie(b.id, capability, process.env.SUPABASE_SECRET_KEY || '')}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400` };
  const returnUrl = `/ramadan-iftari-2027/confirmation?id=${b.id}`;
  if (b.status !== 'pending') return json({ returnUrl }, 200, headers);
  const client = new IftariStripeClient(config);
  // Keep the original idempotency payload, including its original expiry time.
  // Never create another session after Stripe's idempotency retention window.
  if (!b.session_id && Date.now() - Date.parse(b.created_at) > 22 * 3600000) throw new IftariError('This saved checkout needs an ICSH check before retrying. Please quote your booking reference.', 409);
  const session = b.session_id ? await client.client.retrieve(b.session_id) : await client.createBooking(b);
  client.validate(session, bookingSource(b));
  if (!b.session_id) {
    const attached = await createEventService().rpc('icsh_iftari_attach', { p_id: b.id, p_session: session.id, p_account: config.account, p_mode: config.mode });
    if (attached.error || attached.data !== true) throw new IftariError('Your payment link could not be saved. Retry this same booking.', 503);
  }
  if (session.status !== 'open') return json({ returnUrl }, 200, headers);
  return json({ url: client.client.checkoutUrl(session), id: b.id, reference: b.reference }, 200, headers);
}
export async function handleIftari(request: Request, path: string) {
  try {
    const secret = process.env.SUPABASE_SECRET_KEY || '';
    if (!secret) throw new IftariError('The booking service is being prepared.', 503);
    const sessionName = process.env.NODE_ENV === 'production' ? '__Host-icsh-iftari-session' : 'icsh-iftari-session';
    const cookie = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(sessionName + '='))?.slice(sessionName.length + 1);
    const session = signedPublicSession(secret, cookie);
    const sessionHeader = { 'Set-Cookie': `${sessionName}=${session.cookie}; Path=/; ${process.env.NODE_ENV === 'production' ? 'Secure; ' : ''}HttpOnly; SameSite=Strict; Max-Age=28800` };
    if (path.startsWith('admin/')) {
      const access = await organiserSession();
      if (access.status !== 'organiser') throw new IftariError('Sign in with your approved organiser account.', 401);
    }
    if (request.method === 'GET') {
      await rate(request, 'read', 150);
      if (path === 'settings' || path === 'admin/settings') return json({ settings: await iftariSettings(), csrf: session.csrf }, 200, sessionHeader);
      const match = path.match(/^bookings\/([a-f0-9-]{36})$/);
      if (match) {
        const b = await iftariBooking(match[1], request.headers.get('x-booking-token') || '');
        if (!b) throw new IftariError('Booking not found. Open your private booking confirmation.', 404);
        return json({ booking: publicBooking(b) });
      }
      if (path === 'admin/bookings' || path === 'admin/export') {
        const page = Math.max(0, Number(new URL(request.url).searchParams.get('page') || 0));
        if (!Number.isSafeInteger(page) || page > 10000) throw new IftariError('Invalid page.');
        const result = await createEventService().from('icsh_iftari_bookings').select('id,reference,contact,quantities,quote,status,paid_at,refunded_amount,created_at,mode,needs_review', { count: 'exact' }).order('created_at', { ascending: false }).order('id').range(page * 100, page * 100 + 99);
        if (result.error) throw new IftariError('Bookings are temporarily unavailable.', 503);
        return json({ bookings: result.data, total: result.count, page });
      }
      throw new IftariError('Page not found.', 404);
    }
    if (request.method !== 'POST') throw new IftariError('Method not allowed.', 405);
    if (request.headers.get('origin') !== new URL(request.url).origin || !request.headers.get('content-type')?.startsWith('application/json') || !cookie || cookie !== session.cookie || !constantEqual(request.headers.get('x-csrf-token') || '', session.csrf)) throw new IftariError('Your session changed. Reload the form and try again.', 403);
    await rate(request, path.startsWith('admin/') ? 'admin' : path === 'quote' ? 'quote' : path === 'membership' ? 'membership' : 'booking', path === 'quote' ? 100 : 30);
    const body = JSON.parse(await boundedBody(request, 16000));
    if (path === 'admin/settings') {
      const settings = settingsSchema.parse(body);
      const result = await createEventService().rpc('icsh_iftari_configure', { p_configuration: settings, p_expected_version: settings.version });
      if (result.error) databaseError(result.error);
      return json({ settings: settingsSchema.parse(result.data) });
    }
    const settings = await iftariSettings();
    if (path === 'quote') return json({ quote: quoteBooking(settings, quoteInputSchema.parse(body)) });
    if (path === 'membership') {
      const value = z.object({ email: z.string().trim().pipe(z.email().max(254)) }).strict().parse(body);
      const status = await verifyMember(value.email, searchBiginMembershipRecords);
      return json({ status, message: membershipMessages[status] });
    }
    if (path === 'bookings') {
      const input = bookingInputSchema.parse(body);
      const configured = websitePaymentConfiguration(), config = configured && paymentRequestOrigin(configured, request.url);
      if (!config) throw new IftariError('Secure payment is currently unavailable. Please try again later.', 503);
      const requestHash = digest(JSON.stringify({ ...input, capability: undefined }));
      const old = await iftariBooking(input.id, input.capability);
      if (old) {
        if (old.request_hash !== requestHash) throw new IftariError(databaseErrors.P2701, 409);
        return openCheckout(request, old, input.capability);
      }
      const quote = quoteBooking(settings, input);
      if (settings.version !== input.expectedVersion || quote.total !== input.expectedTotal) throw new IftariError(databaseErrors.P2703, 409);
      if (settings.status !== 'published') throw new IftariError(databaseErrors.P2702, 409);
      await verifyMemberTickets(input, searchBiginMembershipRecords);
      const saved = await createEventService().rpc('icsh_iftari_reserve', {
        p_id: input.id, p_request_hash: requestHash, p_capability_hash: digest(input.capability),
        p_contact: { firstName: input.firstName, lastName: input.lastName, email: input.email, mobile: membershipMobileKey(input.mobile) },
        p_quantities: input.quantities, p_member_emails: input.memberEmails, p_donation: quote.donation,
        p_expected_version: input.expectedVersion, p_expected_total: input.expectedTotal, p_account: config.account, p_mode: config.mode,
      });
      if (saved.error || !saved.data) databaseError(saved.error);
      return openCheckout(request, saved.data as BookingRow, input.capability);
    }
    const checkout = path.match(/^checkout\/([a-f0-9-]{36})$/);
    if (checkout) {
      const value = z.object({ capability: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(body);
      const b = await iftariBooking(checkout[1], value.capability);
      if (!b) throw new IftariError('Booking not found.', 404);
      return openCheckout(request, b, value.capability);
    }
    throw new IftariError('Page not found.', 404);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: error.issues[0]?.message || 'Please check the form.' }, 400);
    if (error instanceof IftariError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'Invalid request format.' }, 400);
    console.error('ICSH_IFTARI_REQUEST_PENDING');
    return json({ error: 'The booking service is temporarily unavailable. If you submitted a booking, retry the same saved booking.' }, 503);
  }
}

const supported = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'charge.refunded', 'charge.dispute.created']);
export async function handleIftariWebhook(request: Request): Promise<Response | null> {
  const config = paymentConfiguration(process.env, false);
  if (!config) return null;
  let event;
  try { event = verifyStripeEvent(await boundedBody(request, 256000), request.headers.get('stripe-signature') || '', config); }
  catch { return json({ error: 'Invalid webhook.' }, 400); }
  if (!supported.has(event.type)) return null;
  try {
    const client = new IftariStripeClient(config);
    let object = event.data.object;
    if (!event.type.startsWith('checkout.session.')) {
      if (typeof object.payment_intent !== 'string' || !/^pi_[A-Za-z0-9]+$/.test(object.payment_intent)) return null;
      object = await client.client.request('/payment_intents/' + object.payment_intent);
    }
    const metadata = object.metadata as Record<string, unknown> | undefined;
    if (metadata?.purpose !== iftariPurpose) return null;
    if (typeof metadata.booking_id !== 'string') throw new Error('Missing booking');
    const b = await iftariBooking(metadata.booking_id);
    if (!b || b.account_id !== config.account || b.mode !== config.mode) throw new Error('Mapping mismatch');
    // Recover an attach failure: the signed webhook plus retrieved, validated session is authoritative.
    const sessionId = event.type.startsWith('checkout.session.') ? String(object.id) : b.session_id;
    if (!sessionId || (b.session_id && b.session_id !== sessionId)) throw new Error('Session mismatch');
    const session = await client.client.retrieve(sessionId);
    const outcome = client.outcome(session, bookingSource(b));
    if (!b.session_id) {
      const attached = await createEventService().rpc('icsh_iftari_attach', { p_id: b.id, p_session: sessionId, p_account: config.account, p_mode: config.mode });
      if (attached.error) throw new Error('Attach failed');
    }
    if (event.type === 'checkout.session.async_payment_failed' && outcome.status === 'pending') outcome.status = 'failed';
    const result = await createEventService().rpc('icsh_iftari_record', { p_id: b.id, p_session: sessionId, p_account: config.account, p_mode: config.mode,
      p_event: event.id, p_event_type: event.type, p_status: outcome.status, p_amount: b.total, p_intent: outcome.intent,
      p_charge: outcome.charge, p_paid_at: outcome.paidAt, p_refunded: outcome.refunded });
    if (result.error || result.data !== true) throw new Error('Record failed');
    return json({ received: true });
  } catch { console.error('ICSH_IFTARI_WEBHOOK_RETRY'); return json({ error: 'Payment reconciliation pending. Retry delivery.' }, 503); }
}
