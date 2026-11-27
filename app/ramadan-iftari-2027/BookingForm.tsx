'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ticketKeys, ticketLabels, gbp, eventWhen, type Settings, type Quote, type TicketKey, type Attendee } from '@/lib/iftari/core';
import styles from './iftari.module.css';
import CapacityNotice from '@/components/events-hub/CapacityNotice';
import {capacityMessage} from '@/lib/events-hub/capacity';
import MenuPopup from './MenuPopup';
import type {IftariMenu} from '@/lib/events-hub/iftari-menu';
import noticeStyles from './booking-notice.module.css';

type Result = { status: string; message: string };
function MembershipEmail({ label, value, onChange, csrf, disabled = false }: { label: string; value: string; onChange: (value: string) => void; csrf: string; disabled?: boolean }) {
  const [checked, setChecked] = useState<{ email: string; result: Result } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const address = value.trim().toLowerCase();

  useEffect(() => {
    if (disabled || !csrf || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setCheckingEmail(address);
      try {
        const response = await fetch('/api/iftari/membership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
          body: JSON.stringify({ email: address }),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!controller.signal.aborted) {
          setChecked({ email: address, result: response.ok ? result : { status: 'unavailable', message: result.error || 'Please retry your membership check.' } });
        }
      } catch {
        if (!controller.signal.aborted) setChecked({ email: address, result: { status: 'unavailable', message: 'Membership checks are temporarily unavailable. Please retry.' } });
      } finally {
        if (!controller.signal.aborted) setCheckingEmail(null);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setCheckingEmail(null);
    };
  }, [address, csrf, disabled, retry]);

  const result = checked?.email === address ? checked.result : null;
  const checking = checkingEmail === address;
  return <label className={styles.field}>{label}<input type="email" required autoComplete="email" maxLength={254} value={value} onChange={e => onChange(e.target.value)} disabled={disabled} />
    <span className={styles.membership} role="status">{checking ? 'Checking membership…' : result?.message || 'Enter your membership email address to check your status.'}</span>
    {result && result.status !== 'active' && !disabled && <button className={styles.linkButton} type="button" onClick={()=>setRetry(n=>n+1)} disabled={checking}>Check membership again</button>}
  </label>;
}
export default function BookingForm({menu}:{menu?:IftariMenu}) {
  const [full,setFull]=useState(false);
  const [settings, setSettings] = useState<Settings | null>(null), [csrf, setCsrf] = useState('');
  const [quantities, setQuantities] = useState({ member: 0, nonmember: 0, child: 0, under5: 0 });
  const [firstName, setFirstName] = useState(''), [lastName, setLastName] = useState(''), [email, setEmail] = useState(''), [mobile, setMobile] = useState('');
  const [attendeeNames,setAttendeeNames]=useState<Record<string,{firstName:string;lastName:string}>>({});
  const attendeeSlots=ticketKeys.flatMap(ticket=>Array.from({length:quantities[ticket]},(_,index)=>({ticket,index,key:ticket+'-'+index})));
  const attendees:Attendee[]=attendeeSlots.map(s=>({ticket:s.ticket,firstName:attendeeNames[s.key]?.firstName||'',lastName:attendeeNames[s.key]?.lastName||''}));
  const [donationChoice, setDonationChoice] = useState('0'), [customDonation, setCustomDonation] = useState('');
  const [quoteRefresh, setQuoteRefresh] = useState(0);
  const [quote, setQuote] = useState<Quote | null>(null), [quoteError, setQuoteError] = useState(''), [quotePending, setQuotePending] = useState(false);
  const [discountAvailable,setDiscountAvailable]=useState(false),[codeInput,setCodeInput]=useState(''),[appliedCode,setAppliedCode]=useState(''),[discountFeedback,setDiscountFeedback]=useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState<{ id: string; capability: string } | null>(null);
  const [website, setWebsite] = useState(''), [notes, setNotes] = useState('');
  const quoteSequence = useRef(0);
  const donation = donationChoice === 'other' ? customDonation : donationChoice;
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/iftari/settings', { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setSettings(data.settings);setFull(Boolean(data.limitReached));setDiscountAvailable(Boolean(data.discountCodesAvailable)); setCsrf(data.csrf); }).catch(e => { if (e.name !== 'AbortError') setError(e.message || 'The booking form is temporarily unavailable.'); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!csrf) return;
    const turn = ++quoteSequence.current, controller = new AbortController();
    setQuote(null); setQuoteError('');
    if (ticketKeys.every(key => quantities[key] === 0)) { setQuotePending(false); return; }
    setQuotePending(true);
    if (appliedCode) setDiscountFeedback('Checking code…');
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/iftari/quote', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ quantities, donation,...(appliedCode ? {discountCode:appliedCode} : {}), ...((appliedCode || quantities.member) ? {email} : {}) }) });
        const data = await response.json(); if (turn !== quoteSequence.current || controller.signal.aborted) return;
        if (!response.ok) throw new Error(data.error);
        setQuote(data.quote);
        if (data.discountError) setDiscountFeedback('Code not applied. ' + data.discountError);
        else if (data.quote.promotion) setDiscountFeedback(data.quote.promotion.name + ' applied · ' + gbp(data.quote.promotion.discountPence) + ' saved.');
      } catch (e) { if (turn === quoteSequence.current && !(e instanceof Error && e.name === 'AbortError')) {if(e instanceof Error&&e.message===capacityMessage)setFull(true);setQuoteError(e instanceof Error ? e.message : 'Unable to calculate the total.');if(appliedCode)setDiscountFeedback('Code not applied. ' + (e instanceof Error ? e.message : 'Unable to verify discount code.'));} }
      finally { if (turn === quoteSequence.current) setQuotePending(false); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [quantities, donation, csrf, appliedCode, email, quoteRefresh]);
  function applyCode() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    if (!attendeeSlots.length) {
      setDiscountFeedback('Select tickets before applying a discount code.');
      return;
    }
    setQuote(null);
    setQuotePending(true);
    setAppliedCode(code);
    setQuoteRefresh(n => n + 1);
  }
  function quantityChange(key: TicketKey, value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > (settings?.maxGuests || 12)) return;
    setQuote(null); setQuotePending(true); setQuantities(v => ({ ...v, [key]: value }));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!settings || !quote || quotePending) return;
    setBusy(true); setError('');
    const identity = saved || { id: crypto.randomUUID(), capability: Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('') };
    try {
      // Retain the same booking after a lost response. A retry never creates a second charge.
      sessionStorage.setItem('icsh-iftari-' + identity.id, identity.capability);
      setSaved(identity);
      const response = await fetch('/api/iftari/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ ...identity, firstName, lastName, email, mobile, quantities, attendees, donation, notes, expectedVersion: quote.version, expectedTotal: quote.total,...(quote.promotion?{discountCode:quote.promotion.code}:{}), website }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      window.location.assign(data.url || data.returnUrl);
    } catch (e) {
      setFull(e instanceof Error&&e.message===capacityMessage);setError(e instanceof Error ? e.message : 'Unable to open secure payment. Please retry this booking.');
      // A rejected request with no persisted booking is safe to correct and resubmit.
      try {
        const check = await fetch('/api/iftari/bookings/' + identity.id, { headers: { 'x-booking-token': identity.capability } });
        if (check.status === 404) { setSaved(null); sessionStorage.removeItem('icsh-iftari-' + identity.id); setQuoteRefresh(n => n + 1); }
      } catch { /* Keep the same request identity when the save outcome is uncertain. */ }
    }
    finally { setBusy(false); }
  }
  if (!settings) return <div className="wrap"><CapacityNotice open={full}/><p role="status">{error || 'Loading the Iftari booking form…'}</p></div>;
  const open = settings.status === 'published'&&!full;
  return <div className={`wrap ${styles.layout}`}><CapacityNotice open={full}/>
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.bookingFields}>
        {!open && <div className={noticeStyles.banner} role="status"><h2>{settings.status === 'closed' ? 'Bookings are closed' : 'Bookings are not yet open'}</h2><p>{settings.status === 'closed' ? 'We are no longer accepting new bookings for this event.' : 'You can view the menu and ticket prices below. Bookings will open once the final arrangements are ready.'}</p></div>}
        <div className={styles.eventDetails}><span className="tag">Ramadan · Together as a community</span><h2>A warm welcome to your table.</h2><p>Join ICSH members, families and friends for Iftari at {settings.venue}. Share an evening of food, friendship and community.</p><p><strong>{eventWhen(settings)}</strong></p><MenuPopup menu={menu} eventTitle={settings.title}/></div>
        <div className={styles.fields}>
          <fieldset disabled={busy || Boolean(saved)}><legend><span>01</span> Lead booker details</legend><p>Book places for yourself, your family and friends. Non-members are welcome.</p><div className={styles.grid}>
            <label className={styles.field}>First name<input required autoComplete="given-name" maxLength={80} value={firstName} onChange={e => setFirstName(e.target.value)} /></label>
            <label className={styles.field}>Last name<input required autoComplete="family-name" maxLength={80} value={lastName} onChange={e => setLastName(e.target.value)} /></label>
            <MembershipEmail label="Email address" value={email} onChange={value => { if (appliedCode || quantities.member) setQuote(null); setEmail(value); }} csrf={csrf} />
            <label className={styles.field}>UK mobile number<input type="tel" required autoComplete="tel" maxLength={25} placeholder="07… or +447…" value={mobile} onChange={e => setMobile(e.target.value)} /></label>
          </div></fieldset>
          <fieldset disabled={busy || Boolean(saved)}><legend><span>02</span> Book Tickets</legend><p>Anyone aged 12 or above needs an adult ticket. Children aged 5–11 pay the same price whether members or non-members. Member-priced tickets require an active membership for the lead booker.</p>
            {ticketKeys.map(key => <div className={styles.ticket} key={key}><label htmlFor={'quantity-' + key}><strong>{ticketLabels[key]}</strong><small>{settings.prices[key] === 0 ? key === 'under5' ? 'Free · Please enter number of children under 5' : 'Free' : settings.prices[key] === null ? 'Price to be confirmed' : `${gbp(settings.prices[key]!)} each`}</small></label><input id={'quantity-' + key} aria-label={`${ticketLabels[key]} quantity`} type="number" min={0} max={settings.maxGuests} step={1} value={quantities[key] || ''} disabled={settings.prices[key] === null} onChange={e => quantityChange(key, Number(e.target.value))} /></div>)}
          </fieldset>
          <fieldset disabled={busy || Boolean(saved)}><legend><span>03</span> Everyone attending</legend><p>Enter a first and last name for each selected ticket, including children under 5. Include the main booker only if they are attending.</p>
            {attendeeSlots.length===0?<p>Select tickets above to add attendee names.</p>:attendeeSlots.map((slot,i)=><div key={slot.key}><h3 style={{fontSize:22,marginTop:24}}>{ticketLabels[slot.ticket]} · Guest {slot.index+1}</h3>{i===0&&(slot.ticket==='member'||slot.ticket==='nonmember')&&<button type="button" className={styles.linkButton} onClick={()=>setAttendeeNames(v=>({...v,[slot.key]:{firstName,lastName}}))}>Use main booker’s name for this attendee</button>}<div className={styles.grid}>{(['firstName','lastName'] as const).map(part=><label className={styles.field} key={part}>{part==='firstName'?'First name':'Last name'}<input required maxLength={80} autoComplete="off" value={attendeeNames[slot.key]?.[part]||''} onChange={e=>setAttendeeNames(v=>({...v,[slot.key]:{firstName:v[slot.key]?.firstName||'',lastName:v[slot.key]?.lastName||'',[part]:e.target.value}}))}/></label>)}</div></div>)}
          </fieldset>
          <fieldset disabled={busy || Boolean(saved)}><label className={styles.field}>Additional notes (optional)<textarea rows={4} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Please tell us about allergies, dietary requirements or anything else we should know." /></label></fieldset>
          <fieldset disabled={busy || Boolean(saved)}><legend><span>04</span> An optional act of kindness</legend><p>Would you like to make an additional donation to support ICSH and its community activities?</p><div className={styles.donations}>{['0', '5', '10', '20', '50', 'other'].map(amount => <label key={amount} className={donationChoice === amount ? styles.selected : ''}><input type="radio" name="donation" value={amount} checked={donationChoice === amount} onChange={() => { setQuote(null); setQuotePending(true); setDonationChoice(amount); }} />{amount === '0' ? 'No donation' : amount === 'other' ? 'Other amount' : '£' + amount}</label>)}</div>
            {donationChoice === 'other' && <label className={styles.field}>Donation amount (£)<input type="text" inputMode="decimal" required maxLength={12} placeholder="0.00" value={customDonation} onChange={e => { setQuote(null); setQuotePending(true); setCustomDonation(e.target.value); }} /></label>}<p className={styles.note}>Entirely optional. Your donation defaults to £0.</p>
          </fieldset>
          {discountAvailable&&<fieldset disabled={busy||Boolean(saved)}><legend><span>05</span> Discounts</legend><p>Have a discount code? Apply it to see the revised booking total before payment. Only one code can be used per booking.</p>
            <label className={styles.field}>Have a discount code?<input type="text" maxLength={32} autoComplete="off" placeholder="Enter your code" value={codeInput} onChange={e=>{setCodeInput(e.target.value.toUpperCase());if(appliedCode){setQuote(null);setAppliedCode('');setDiscountFeedback('Apply the new code to see the discount.');}}} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); applyCode(); } }}/></label>
            <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
              <button type="button" className={styles.linkButton} disabled={!codeInput.trim()} onClick={applyCode}>Apply Code</button>
              {appliedCode&&<button type="button" className={styles.linkButton} onClick={()=>{setQuote(null);setAppliedCode('');setCodeInput('');setDiscountFeedback('Discount code removed.');}}>Remove code</button>}
            </div>
            <p className={styles.note} role="status" aria-live="polite">{discountFeedback}</p>
          </fieldset>}
          <label className={styles.honeypot} aria-hidden="true">Leave this field empty<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
          <p className={styles.note}>We use these details to manage your booking and payment, check member ticket eligibility and send your confirmation. Read our <Link href="/privacy">privacy notice</Link>.</p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {saved ? <div className="notice"><p>Your booking request has been saved for retry. Keep these details unchanged to avoid duplicate bookings.</p><Link href={`/ramadan-iftari-2027/confirmation?id=${saved.id}`}>View or resume this booking</Link></div> : null}
        </div>
      </div>
      <aside className={styles.summary}>
        <span className={`eyebrow ${styles.summaryContext}`}>Your evening, together</span>
        <h2>Booking summary</h2>
        <p className={styles.summaryContext}>{settings.title}<br/>{settings.venue}</p>
        <div aria-live="polite" aria-atomic="true">
          {quotePending ? <p>Updating your total…</p> : quoteError ? <p className={styles.error}>{quoteError}</p> : quote ? <>
            <dl>
              {quote.lines.map(line => (
                <div key={line.key}>
                  <dt>{line.key === 'donation' ? line.label : `${line.quantity} × ${line.label}`}
                    <small>{line.key !== 'donation' ? `${gbp(line.unitAmount)} each` : 'Thank you for your support'}</small>
                  </dt>
                  <dd>{gbp(line.amount)}</dd>
                </div>
              ))}
              {!quote.donation && <div className={styles.emptyDonation}><dt>Optional ICSH Donation</dt><dd>£0.00</dd></div>}
              {quote.promotion && <>
                <div><dt>Original booking total</dt><dd>{gbp(quote.promotion.grossPence)}</dd></div>
                <div><dt>{quote.promotion.name} ({quote.promotion.code})</dt><dd>-{gbp(quote.promotion.discountPence)}</dd></div>
              </>}
            </dl>
            <div className={styles.total}><span>Total payable</span><strong>{gbp(quote.total)}</strong></div>
            <p className={styles.summaryNote}>{quote.guests} {quote.guests === 1 ? 'guest' : 'guests'} · All prices in GBP<br/>Member prices subject to verification.</p>
          </> : <>
            <p>Select your tickets to see your booking summary.</p>
            <div className={styles.total}><span>Total payable</span><strong>£0.00</strong></div>
          </>}
        </div>
        <div className={styles.summaryFooter}><span className={styles.summaryContext}>Secure payment with Stripe<br/></span><Link href="/contact">Need help with your booking?</Link></div>
      </aside>
      <div className={styles.checkout}>
        <button type="submit" className="button" disabled={!open || busy || !quote || quotePending}>{busy ? 'Opening secure payment…' : saved ? 'Retry Secure Payment' : 'Proceed to Secure Payment'} <span aria-hidden="true">↗</span></button>
        <p className={styles.note}>Your places are confirmed after Stripe confirms successful payment. Card details are handled securely by Stripe.</p>
      </div>
    </form>
  </div>;
}
