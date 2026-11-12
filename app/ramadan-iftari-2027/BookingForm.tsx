'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ticketKeys, ticketLabels, gbp, eventWhen, type Settings, type Quote, type TicketKey } from '@/lib/iftari/core';
import styles from './iftari.module.css';

type Result = { status: string; message: string };
function MembershipEmail({ label, value, onChange, csrf, disabled = false }: { label: string; value: string; onChange: (value: string) => void; csrf: string; disabled?: boolean }) {
  const [checked, setChecked] = useState<{ email: string; result: Result } | null>(null);
  const [checking, setChecking] = useState(false);
  const sequence = useRef(0);
  useEffect(() => { sequence.current++; setChecking(false); }, [value]);
  async function check() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || !csrf) return;
    const turn = ++sequence.current, address = value;
    setChecking(true);
    try {
      const response = await fetch('/api/iftari/membership', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ email: address }) });
      const result = await response.json();
      if (turn === sequence.current) setChecked({ email: address, result: response.ok ? result : { status: 'unavailable', message: result.error || 'Please retry your membership check.' } });
    } catch { if (turn === sequence.current) setChecked({ email: address, result: { status: 'unavailable', message: 'Membership checks are temporarily unavailable. Please retry.' } }); }
    finally { if (turn === sequence.current) setChecking(false); }
  }
  const result = checked?.email === value ? checked.result : null;
  return <label className={styles.field}>{label}<input type="email" required autoComplete="email" maxLength={254} value={value} onChange={e => onChange(e.target.value)} onBlur={check} disabled={disabled} />
    <span className={styles.membership} role="status">{checking ? 'Checking membership…' : result?.message || 'Membership is checked securely when you leave this field.'}</span>
    {result && result.status !== 'active' && !disabled && <button className={styles.linkButton} type="button" onClick={check} disabled={checking}>Check membership again</button>}
  </label>;
}
export default function BookingForm() {
  const [settings, setSettings] = useState<Settings | null>(null), [csrf, setCsrf] = useState('');
  const [quantities, setQuantities] = useState({ member: 0, nonmember: 1, child: 0, under5: 0 });
  const [firstName, setFirstName] = useState(''), [lastName, setLastName] = useState(''), [email, setEmail] = useState(''), [mobile, setMobile] = useState('');
  const [memberEmails, setMemberEmails] = useState<string[]>([]), [donationChoice, setDonationChoice] = useState('0'), [customDonation, setCustomDonation] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null), [quoteError, setQuoteError] = useState(''), [quotePending, setQuotePending] = useState(false);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState<{ id: string; capability: string } | null>(null);
  const [website, setWebsite] = useState('');
  const quoteSequence = useRef(0);
  const donation = donationChoice === 'other' ? customDonation : donationChoice;
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/iftari/settings', { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setSettings(data.settings); setCsrf(data.csrf); }).catch(e => { if (e.name !== 'AbortError') setError(e.message || 'The booking form is temporarily unavailable.'); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!csrf) return;
    const turn = ++quoteSequence.current, controller = new AbortController();
    setQuotePending(true); setQuote(null); setQuoteError('');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/iftari/quote', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ quantities, donation }) });
        const data = await response.json(); if (turn !== quoteSequence.current) return;
        if (!response.ok) throw new Error(data.error); setQuote(data.quote);
      } catch (e) { if (turn === quoteSequence.current && !(e instanceof Error && e.name === 'AbortError')) setQuoteError(e instanceof Error ? e.message : 'Unable to calculate the total.'); }
      finally { if (turn === quoteSequence.current) setQuotePending(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [quantities, donation, csrf]);
  function quantityChange(key: TicketKey, value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > (settings?.maxGuests || 12)) return;
    setQuote(null); setQuotePending(true); setQuantities(v => ({ ...v, [key]: value }));
    if (key === 'member') setMemberEmails(old => Array.from({ length: value }, (_, i) => old[i] || ''));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings || !quote || quotePending) return;
    setBusy(true); setError('');
    const identity = saved || { id: crypto.randomUUID(), capability: Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('') };
    try {
      // Retain the same booking after a lost response. A retry never creates a second charge.
      sessionStorage.setItem('icsh-iftari-' + identity.id, identity.capability);
      setSaved(identity);
      const response = await fetch('/api/iftari/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ ...identity, firstName, lastName, email, mobile, quantities, memberEmails, donation, expectedVersion: quote.version, expectedTotal: quote.total, website }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      window.location.assign(data.url || data.returnUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open secure payment. Please retry this booking.');
      // A rejected request with no persisted booking is safe to correct and resubmit.
      try {
        const check = await fetch('/api/iftari/bookings/' + identity.id, { headers: { 'x-booking-token': identity.capability } });
        if (check.status === 404) { setSaved(null); sessionStorage.removeItem('icsh-iftari-' + identity.id); }
      } catch { /* Keep the same request identity when the save outcome is uncertain. */ }
    }
    finally { setBusy(false); }
  }
  if (!settings) return <div className="wrap"><p role="status">{error || 'Loading the Iftari booking form…'}</p></div>;
  const open = settings.status === 'published';
  return <div className={`wrap ${styles.layout}`}>
    <div>
      <div className={styles.eventDetails}><span className="tag">Ramadan · Together as a community</span><h2>A warm welcome to your table.</h2><p>Join ICSH members, families and friends for Iftari at {settings.venue}. Share an evening of food, friendship and community.</p><p><strong>{eventWhen(settings)}</strong><br/>Organised by the Islamic &amp; Cultural Society of Harrow (ICSH)</p></div>
      {!open && <div className="notice"><strong>{settings.status === 'closed' ? 'Bookings are closed.' : 'Bookings will open soon.'}</strong><p>You can explore the form and ticket prices below. Date and time will be confirmed by ICSH.</p></div>}
      <form onSubmit={submit} className={styles.form}>
        <fieldset disabled={busy || Boolean(saved)}><legend><span>01</span> Lead booker details</legend><p>Book places for yourself, your family and friends. Non-members are welcome.</p><div className={styles.grid}>
          <label className={styles.field}>First name<input required autoComplete="given-name" maxLength={80} value={firstName} onChange={e => setFirstName(e.target.value)} /></label>
          <label className={styles.field}>Last name<input required autoComplete="family-name" maxLength={80} value={lastName} onChange={e => setLastName(e.target.value)} /></label>
          <MembershipEmail label="Email address" value={email} onChange={setEmail} csrf={csrf} />
          <label className={styles.field}>UK mobile number<input type="tel" required autoComplete="tel" maxLength={25} placeholder="07… or +447…" value={mobile} onChange={e => setMobile(e.target.value)} /></label>
        </div></fieldset>
        <fieldset disabled={busy || Boolean(saved)}><legend><span>02</span> Your guests</legend><p>Anyone aged 12 or above needs an adult ticket. Children aged 5–11 pay the same price whether members or non-members.</p>
          {ticketKeys.map(key => <div className={styles.ticket} key={key}><label htmlFor={'quantity-' + key}><strong>{ticketLabels[key]}</strong><small>{settings.prices[key] === null ? 'Price to be confirmed · booking unavailable' : `${gbp(settings.prices[key]!)} each`}</small></label><input id={'quantity-' + key} aria-label={`${ticketLabels[key]} quantity`} type="number" min={0} max={settings.maxGuests} step={1} value={quantities[key]} disabled={settings.prices[key] === null} onChange={e => quantityChange(key, Number(e.target.value))} /></div>)}
          <p className={styles.note}>Maximum {settings.maxGuests} guests per booking. Please contact ICSH before booking a place for a child under 5 while the price is awaiting confirmation.</p>
          {memberEmails.length > 0 && <div className={styles.memberList}><h3>Member ticket verification</h3><p>Enter a different active membership email for each adult member ticket. A lead booker's membership does not apply to other guests.</p>{memberEmails.map((address, i) => <div key={i} className={styles.memberRow}><MembershipEmail label={`Member ticket ${i + 1} – attendee email`} value={address} csrf={csrf} onChange={value => setMemberEmails(old => old.map((s, n) => n === i ? value : s))} />{i === 0 && email && <button className={styles.linkButton} type="button" onClick={() => setMemberEmails(old => old.map((s, n) => n === 0 ? email : s))}>Use my email for this ticket</button>}</div>)}</div>}
        </fieldset>
        <fieldset disabled={busy || Boolean(saved)}><legend><span>03</span> An optional act of kindness</legend><p>Would you like to make an additional donation to support ICSH and its community activities?</p><div className={styles.donations}>{['0', '5', '10', '20', '50', 'other'].map(amount => <label key={amount} className={donationChoice === amount ? styles.selected : ''}><input type="radio" name="donation" value={amount} checked={donationChoice === amount} onChange={() => { setQuote(null); setQuotePending(true); setDonationChoice(amount); }} />{amount === '0' ? 'No donation' : amount === 'other' ? 'Other amount' : '£' + amount}</label>)}</div>
          {donationChoice === 'other' && <label className={styles.field}>Donation amount (£)<input type="text" inputMode="decimal" required maxLength={12} placeholder="0.00" value={customDonation} onChange={e => { setQuote(null); setQuotePending(true); setCustomDonation(e.target.value); }} /></label>}<p className={styles.note}>Entirely optional. Your donation defaults to £0.</p>
        </fieldset>
        <label className={styles.honeypot} aria-hidden="true">Leave this field empty<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
        <p className={styles.note}>We use these details to manage your booking and payment, check member ticket eligibility and send your confirmation. Read our <Link href="/privacy">privacy notice</Link>.</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {saved ? <div className="notice"><p>Your booking request has been saved for retry. Keep these details unchanged to avoid duplicate bookings.</p><Link href={`/ramadan-iftari-2027/confirmation?id=${saved.id}`}>View or resume this booking</Link></div> : null}
        <button type="submit" className="button" disabled={!open || busy || !quote || quotePending}>{busy ? 'Opening secure payment…' : saved ? 'Retry Secure Payment' : 'Proceed to Secure Payment'} <span aria-hidden="true">↗</span></button>
        <p className={styles.note}>Your places are confirmed after Stripe confirms successful payment. Card details are handled securely by Stripe.</p>
      </form>
    </div>
    <aside className={styles.summary}><span className="eyebrow">Your evening, together</span><h2>Booking summary</h2><p>{settings.title}<br/>{settings.venue}</p><div aria-live="polite" aria-atomic="true">{quotePending ? <p>Updating your total…</p> : quoteError ? <p className={styles.error}>{quoteError}</p> : quote ? <><dl>{quote.lines.map(line => <div key={line.key}><dt>{line.key === 'donation' ? line.label : `${line.quantity} × ${line.label}`}<small>{line.key !== 'donation' ? `${gbp(line.unitAmount)} each` : 'Thank you for your support'}</small></dt><dd>{gbp(line.amount)}</dd></div>)}{!quote.donation && <div><dt>Optional ICSH Donation</dt><dd>£0.00</dd></div>}</dl><div className={styles.total}><span>Total payable</span><strong>{gbp(quote.total)}</strong></div><p className={styles.note}>{quote.guests} {quote.guests === 1 ? 'guest' : 'guests'} · All prices in GBP<br/>Member prices subject to verification.</p></> : null}</div><div className={styles.summaryFooter}>Secure payment with Stripe<br/><Link href="/contact">Need help with your booking?</Link></div></aside>
  </div>;
}
