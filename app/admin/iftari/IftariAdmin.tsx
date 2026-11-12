'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { gbp, ticketKeys, ticketLabels, type Settings, type Quote } from '@/lib/iftari/core';
import styles from '@/app/ramadan-iftari-2027/iftari.module.css';
type AdminBooking = { id: string; reference: string; contact: { firstName: string; lastName: string; email: string; mobile: string }; quantities: Record<string, number>; quote: Quote; status: string; mode: string; needs_review: boolean; created_at: string };
export default function IftariAdmin() {
  const [settings, setSettings] = useState<Settings | null>(null), [csrf, setCsrf] = useState(''), [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [page, setPage] = useState(0), [total, setTotal] = useState(0), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function loadBookings(n: number) {
    const response = await fetch('/api/iftari/admin/bookings?page=' + n), data = await response.json();
    if (!response.ok) throw new Error(data.error); setBookings(data.bookings); setTotal(data.total); setPage(n);
  }
  useEffect(() => {
    Promise.all([fetch('/api/iftari/admin/settings').then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setSettings(d.settings); setCsrf(d.csrf); }), loadBookings(0)]).catch(e => setError(e.message));
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData(event.currentTarget);
      const money = (value: string) => { if (!/^\d{1,4}(\.\d{1,2})?$/.test(value)) throw new Error('Enter ticket prices in pounds, with up to two decimal places.'); const [whole, p = ''] = value.split('.'); return Number(whole) * 100 + Number(p.padEnd(2, '0')); };
      const prices = Object.fromEntries(ticketKeys.map(key => [key, key === 'under5' && !String(form.get('price-' + key) || '').trim() ? null : money(String(form.get('price-' + key)))]));
      const value = { ...settings, title: String(form.get('title')), venue: String(form.get('venue')), date: String(form.get('date')) || null, time: String(form.get('time')) || null, status: String(form.get('status')), capacity: form.get('capacity') ? Number(form.get('capacity')) : null, maxGuests: Number(form.get('maxGuests')), allowRepeatMemberDiscounts: form.get('repeat') === 'on', prices };
      const response = await fetch('/api/iftari/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(value) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); setSettings(data.settings); setMessage('Iftari settings saved. Existing bookings keep their original ticket prices and event details.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save settings.'); }
    finally { setBusy(false); }
  }
  async function exportCsv() {
    setBusy(true); setError('');
    try {
      const all: AdminBooking[] = [];
      for (let n = 0; ; n++) {
        const response = await fetch('/api/iftari/admin/bookings?page=' + n), data = await response.json(); if (!response.ok) throw new Error(data.error);
        all.push(...data.bookings); if (all.length >= data.total || !data.bookings.length) break;
      }
      const cell = (value: unknown) => { const s = String(value ?? ''); return '"' + (/^[\s]*[=+@-]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'; };
      const rows = [['Reference', 'Mode', 'Status', 'Review required', 'Lead booker', 'Email', 'Mobile', ...ticketKeys.map(k => ticketLabels[k]), 'Tickets GBP', 'Donation GBP', 'Total GBP', 'Created']];
      for (const b of all) rows.push([b.reference, b.mode, b.status, b.needs_review ? 'Yes' : 'No', `${b.contact.firstName} ${b.contact.lastName}`, b.contact.email, b.contact.mobile, ...ticketKeys.map(k => String(b.quantities[k])), (b.quote.tickets / 100).toFixed(2), (b.quote.donation / 100).toFixed(2), (b.quote.total / 100).toFixed(2), b.created_at]);
      const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'icsh-iftari-2027-bookings.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to export bookings.'); }
    finally { setBusy(false); }
  }
  return <div className={styles.admin}>
    <p><Link href="/admin">← Organiser workspace</Link> · <Link href="/ramadan-iftari-2027">View booking form ↗</Link></p>
    <div className="notice"><strong>Confirm the event details before opening bookings.</strong><p>Leave the under-5 price blank while the policy is unconfirmed. Enter 0 only if ICSH has approved free under-5 places. All guests, including under-5s, count towards capacity. Pending Stripe checkouts reserve places and member discounts until their verified payment or expiry notification.</p></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className="notice">{message}</p>}
    {settings ? <form key={settings.version} onSubmit={save} className={styles.admin}>
      <fieldset disabled={busy}><legend>Event &amp; availability</legend><div className={styles.grid}>
        <label className={styles.field}>Event title<input name="title" required maxLength={140} defaultValue={settings.title} /></label><label className={styles.field}>Venue<input name="venue" required maxLength={240} defaultValue={settings.venue} /></label>
        <label className={styles.field}>Date (leave blank for TBC)<input name="date" type="date" defaultValue={settings.date || ''} /></label><label className={styles.field}>Time (UK local time; leave blank for TBC)<input name="time" type="time" defaultValue={settings.time || ''} /></label>
        <label className={styles.field}>Booking status<select name="status" defaultValue={settings.status}><option value="draft">Draft – bookings unavailable</option><option value="published">Published – bookings open</option><option value="closed">Closed – no new bookings</option></select></label>
        <label className={styles.field}>Capacity (blank for no limit)<input name="capacity" type="number" min={1} max={10000} step={1} defaultValue={settings.capacity || ''} /></label>
        <label className={styles.field}>Maximum guests per booking<input name="maxGuests" type="number" min={1} max={50} step={1} required defaultValue={settings.maxGuests} /></label>
      </div></fieldset>
      <fieldset disabled={busy}><legend>Ticket prices (£)</legend><div className={styles.grid}>{ticketKeys.map(key => <label key={key} className={styles.field}>{ticketLabels[key]}<input name={'price-' + key} type="text" inputMode="decimal" required={key !== 'under5'} defaultValue={settings.prices[key] === null ? '' : (settings.prices[key]! / 100).toFixed(2)} placeholder={key === 'under5' ? 'Awaiting confirmation' : undefined} /></label>)}</div>
        <label className={styles.adminToggle}><input type="checkbox" name="repeat" defaultChecked={settings.allowRepeatMemberDiscounts} /><span>Allow a verified member email to receive the discount in more than one booking for this event. Each email still qualifies for only one member ticket within each booking.</span></label>
      </fieldset><button disabled={busy} className="button" type="submit">{busy ? 'Saving…' : 'Save Iftari settings'}</button>
    </form> : <p>Loading settings…</p>}
    <section><h2>Bookings ({total})</h2><div className={styles.buttons}><button className="button outline" type="button" disabled={busy} onClick={exportCsv}>Export all bookings as CSV</button><button className="button outline" type="button" disabled={busy} onClick={() => loadBookings(page).catch(e => setError(e.message))}>Refresh bookings</button></div>
      <p className={styles.note}>Pending bookings with no attached checkout, or a delayed expiry notification, remain reserved to avoid overselling. If a checkout needs attention, find the booking reference in Stripe and resend its webhook delivery. A return page or organiser action never marks a payment successful.</p>
      <div className={styles.tableWrap}><table><thead><tr><th>Reference / mode</th><th>Lead booker</th><th>Guests</th><th>Tickets / donation / total</th><th>Status</th></tr></thead><tbody>{bookings.map(b => <tr key={b.id}><td>{b.reference}<br/>{b.mode}</td><td>{b.contact.firstName} {b.contact.lastName}<br/>{b.contact.email}<br/>{b.contact.mobile}</td><td>{ticketKeys.filter(k => b.quantities[k]).map(k => <div key={k}>{b.quantities[k]} × {ticketLabels[k]}</div>)}</td><td>{gbp(b.quote.tickets)}<br/>Donation: {gbp(b.quote.donation)}<br/><strong>{gbp(b.quote.total)}</strong></td><td>{b.status === 'paid' && !b.needs_review ? 'Paid / Confirmed' : b.status}{b.needs_review && <strong> – review required</strong>}</td></tr>)}</tbody></table></div>
      <div className={styles.buttons}><button type="button" className="button outline" disabled={page === 0 || busy} onClick={() => loadBookings(page - 1).catch(e => setError(e.message))}>Previous</button><p>Page {page + 1} · showing {bookings.length} of {total}</p><button type="button" className="button outline" disabled={(page + 1) * 100 >= total || busy} onClick={() => loadBookings(page + 1).catch(e => setError(e.message))}>Next</button></div>
    </section>
  </div>;
}
