'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { MemberSearchInput, MemberSearchResult } from '@/lib/member-search';
import styles from './MemberSearch.module.css';

type Method = MemberSearchInput['method'];
const options: { method: Method; label: string }[] = [{ method: 'email', label: 'Email address' }, { method: 'mobile', label: 'Phone number' }, { method: 'name', label: 'Full name' }];
const renewalUrl = '/membership?category=renewal#join';
const dateLabel = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));
function readResult(value: unknown): MemberSearchResult | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.status === 'not_found' || v.status === 'ambiguous' || v.status === 'expired_undated' || v.status === 'dates_unavailable') return { status: v.status };
  const date = (x: unknown): x is string => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x));
  if (v.status === 'expired' && date(v.membershipExpiry)) return { status: 'expired', membershipExpiry: v.membershipExpiry };
  return v.status === 'found' && date(v.membershipDate) && date(v.membershipExpiry) && typeof v.daysUntilExpiry === 'number' && Number.isSafeInteger(v.daysUntilExpiry)
    ? { status: 'found', membershipDate: v.membershipDate, membershipExpiry: v.membershipExpiry, daysUntilExpiry: v.daysUntilExpiry } : null;
}

export default function MemberSearch() {
  const id = useId();
  const [method, setMethod] = useState<Method>('email');
  const [firstName, setFirstName] = useState(''), [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(''), [mobile, setMobile] = useState('');
  const [result, setResult] = useState<MemberSearchResult | null>(null);
  const [error, setError] = useState(''), [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null), revision = useRef(0);
  const feedback = useRef<HTMLDivElement>(null), firstInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  function clear() { revision.current++; request.current?.abort(); setResult(null); setError(''); setPending(false); }
  function choose(next: Method, focus = false) { clear(); setMethod(next); if (focus) requestAnimationFrame(() => firstInput.current?.focus()); }
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    const current = revision.current;
    const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30_000);
    setPending(true);
    const body: MemberSearchInput = method === 'name' ? { method, firstName, lastName } : method === 'email' ? { method, email } : { method, mobile };
    try {
      const response = await fetch('/api/membership/search', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      const data: unknown = await response.json();
      if (current !== revision.current) return;
      if (!response.ok) {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' && data.error.length < 300 ? data.error : 'We could not complete your search. Please try again.';
        setError(message);
      } else {
        const answer = readResult(data);
        if (!answer) throw new Error('Unexpected result');
        setResult(answer);
      }
    } catch {
      if (current === revision.current) setError('We could not complete your search. Please try again or contact ICSH.');
    } finally {
      clearTimeout(timeout);
      if (current === revision.current) { setPending(false); requestAnimationFrame(() => feedback.current?.focus()); }
    }
  }
  return <div className={styles.lookup} onKeyDown={event => event.stopPropagation()}>
    <p className={styles.intro}>Choose <strong>one</strong> way to search using the details from your membership registration.</p>
    <form onSubmit={search} aria-busy={pending}>
      <fieldset className={styles.options}><legend>Search by</legend><div className={styles.methods}>{options.map(option => <label key={option.method} className={method === option.method ? styles.selected : ''}><input type="radio" name={`${id}-method`} value={option.method} checked={method === option.method} onChange={() => choose(option.method)}/><span>{option.label}</span></label>)}</div></fieldset>
      <div key={method} className={styles.fields}>
        {method === 'name' ? <div className={styles.names}>
          <div><label htmlFor={`${id}-first`}>First name</label><input ref={firstInput} id={`${id}-first`} name="firstName" autoComplete="given-name" required maxLength={80} value={firstName} onChange={event => { clear(); setFirstName(event.target.value); }}/></div>
          <div><label htmlFor={`${id}-last`}>Last name</label><input id={`${id}-last`} name="lastName" autoComplete="family-name" required maxLength={80} value={lastName} onChange={event => { clear(); setLastName(event.target.value); }}/></div>
        </div> : method === 'email' ? <div><label htmlFor={`${id}-email`}>Email address</label><input ref={firstInput} id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => { clear(); setEmail(event.target.value); }}/></div> : <div><label htmlFor={`${id}-mobile`}>Phone number</label><input ref={firstInput} id={`${id}-mobile`} name="mobile" type="tel" autoComplete="tel" required maxLength={30} aria-describedby={`${id}-mobile-hint`} value={mobile} onChange={event => { clear(); setMobile(event.target.value); }}/><p id={`${id}-mobile-hint`} className={styles.hint}>UK numbers can start with 07 or +44. For other countries, include the country code.</p></div>}
      </div>
      <button className={`button ${styles.submit}`} type="submit" disabled={pending}>{pending ? 'Checking membership…' : 'Find my membership'}<span aria-hidden="true">→</span></button>
    </form>
    <div ref={feedback} tabIndex={-1} aria-live="polite" aria-atomic="true" className={styles.feedback}>
      {error ? <p role="alert" className={styles.message}>{error}</p> : null}
      {result?.status === 'found' ? <section className={styles.result} aria-label="Your membership dates"><span className="eyebrow">Your membership</span><dl>
        <div><dt>Membership Date</dt><dd>{dateLabel(result.membershipDate)}</dd></div>
        <div><dt>Membership Expiry</dt><dd>{dateLabel(result.membershipExpiry)}</dd></div>
        <div className={styles.days}><dt>Approximately</dt><dd>{result.daysUntilExpiry.toLocaleString('en-GB')} {result.daysUntilExpiry === 1 ? 'day' : 'days'} remaining</dd></div>
      </dl><p className={styles.hint}>Renewal is due on the expiry date.</p></section> : null}
      {result?.status === 'expired' ? <section className={styles.result} aria-label="Expired membership"><strong>Your membership expired on {dateLabel(result.membershipExpiry)}.</strong><p>Please renew your membership to continue enjoying ICSH member benefits.</p><Link className="button" href={renewalUrl}>Renew your membership <span aria-hidden="true">→</span></Link></section> : null}
      {result?.status === 'expired_undated' ? <section className={styles.result} aria-label="Expired membership"><strong>Your membership has expired.</strong><p>Please renew your membership to continue enjoying ICSH member benefits.</p><Link className="button" href={renewalUrl}>Renew your membership <span aria-hidden="true">→</span></Link></section> : null}
      {result?.status === 'ambiguous' ? <div className={styles.message}><strong>We need a different way to find you.</strong><p>{method === 'name' ? 'More than one record matches this name. Please search using your email address or mobile number.' : 'These details match more than one record. Try another search option using your own registration details. If your family shares those details, contact ICSH for help.'}</p><div className={styles.alternatives}>{options.filter(option => option.method !== method).map(option => <button type="button" className="text-button" key={option.method} onClick={() => choose(option.method, true)}>Search by {option.method === 'name' ? 'name' : option.label.toLowerCase()}</button>)}</div><Link href="/contact">Contact ICSH</Link></div> : null}
      {result?.status === 'not_found' ? <div className={styles.message}><strong>We cannot find any records under this {method === 'email' ? 'email address' : method === 'mobile' ? 'phone number' : 'name'}.</strong><p>Check the details you entered or try another search option using the details from your membership registration.</p><Link href="/contact">Contact ICSH for help</Link></div> : null}
      {result?.status === 'dates_unavailable' ? <div className={styles.message}><strong>We couldn’t confirm your membership dates.</strong><p>Please contact ICSH so we can check your record.</p><Link href="/contact">Contact ICSH</Link></div> : null}
    </div>
    <p className={styles.privacy}>Search details are not saved in your browser. <Link href="/privacy#member-search">Privacy information</Link>.</p>
  </div>;
}
