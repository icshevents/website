'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { gbp, eventWhen, type Settings, type Quote } from '@/lib/iftari/core';
import styles from '../iftari.module.css';
export type ReceiptBooking = { id: string; reference: string; event: Settings; quote: Quote; status: string; confirmed: boolean; paidAt: string | null; refundedAmount: number; mode: string };
export default function Receipt({ id, initial }: { id: string; initial: ReceiptBooking | null }) {
  const [booking, setBooking] = useState(initial), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true); setError('');
    try {
      const token = sessionStorage.getItem('icsh-iftari-' + id);
      if (!token) { if (!booking) throw new Error('Open this confirmation in the browser used to book, or contact ICSH with your booking reference.'); return; }
      const response = await fetch('/api/iftari/bookings/' + id, { headers: { 'x-booking-token': token } });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); setBooking(data.booking);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to refresh your booking.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (!initial) void refresh(); }, [id]); // Receipt reads never confirm or reconcile payment.
  async function pay() {
    setBusy(true); setError('');
    try {
      const token = sessionStorage.getItem('icsh-iftari-' + id);
      if (!token) throw new Error('Please return to your original booking browser, or contact ICSH to resume payment.');
      const sessionResponse = await fetch('/api/iftari/settings'), session = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(session.error);
      const response = await fetch('/api/iftari/checkout/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': session.csrf }, body: JSON.stringify({ capability: token }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      if (data.url) window.location.assign(data.url); else await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to resume payment.'); }
    finally { setBusy(false); }
  }
  return <div className={`wrap ${styles.receipt}`}>
    <span className="tag">ICSH Ramadan Iftari 2027</span><h1>{booking?.confirmed ? 'Your places are confirmed.' : booking?.status === 'paid' ? 'Payment received. Please contact ICSH.' : booking && ['refunded', 'partially_refunded', 'disputed'].includes(booking.status) ? 'Your payment has been updated.' : 'Your booking is awaiting payment confirmation.'}</h1>
    {booking ? <>
      {booking.mode === 'test' && <div className="notice"><strong>Test booking — no live event places are confirmed.</strong></div>}
      <p>Booking reference<br/><strong className={styles.reference}>{booking.reference}</strong></p>
      <h2>{booking.event.title}</h2><p>{booking.event.venue}<br/>{eventWhen(booking.event)}</p>
      <dl>{booking.quote.lines.map(line => <div key={line.key}><dt>{line.key === 'donation' ? line.label : `${line.quantity} × ${line.label} at ${gbp(line.unitAmount)}`}</dt><dd>{gbp(line.amount)}</dd></div>)}</dl>
      {!booking.quote.donation && <p>Optional ICSH Donation: £0.00</p>}
      <div className={styles.total}><span>{booking.paidAt ? 'Total paid' : 'Total payable'}</span><strong>{gbp(booking.quote.total)}</strong></div>
      {booking.refundedAmount > 0 && <p>Refunded: {gbp(booking.refundedAmount)}</p>}
      <p>{booking.confirmed ? 'Thank you. Stripe has confirmed your payment and your places are reserved. A confirmation email is sent to the lead booker. Please keep your booking reference.' : booking.status === 'pending' ? 'Your payment may still be processing, or you may have returned without completing payment. Refresh to check again. Confirmation follows a verified Stripe payment notification.' : ['failed', 'expired'].includes(booking.status) ? 'This checkout did not complete successfully. Your places have been released. You can start a new booking.' : 'Please contact ICSH with your reference if you need help with your booking or payment.'}</p>
      <div className={styles.buttons}><button type="button" className="button outline" disabled={busy} onClick={refresh}>{busy ? 'Checking…' : 'Refresh booking status'}</button>{booking.status === 'pending' && <button type="button" className="button" disabled={busy} onClick={pay}>Resume Secure Payment ↗</button>}{['expired', 'failed'].includes(booking.status) && <Link className="button" href="/ramadan-iftari-2027">Start a new booking</Link>}</div>
    </> : <p>{busy ? 'Loading your saved booking…' : 'No booking details have been displayed.'}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p><Link href="/contact">Contact ICSH</Link> · <Link href="/events">Return to events</Link></p>
  </div>;
}
