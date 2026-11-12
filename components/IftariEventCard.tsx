import Link from 'next/link';
import { iftariSettings } from '@/lib/iftari/server';
import { eventWhen, gbp } from '@/lib/iftari/core';
export default async function IftariEventCard() {
  try {
    const settings = await iftariSettings();
    if (settings.date && settings.date < new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })) return null;
    return <article className="panel our-event-panel" id="ramadan-iftari-2027"><div className="our-event-summary"><span className="tag">Ramadan · Community gathering</span><h3>{settings.title}</h3><p className="our-event-date"><strong>{eventWhen(settings)}</strong><br/>{settings.venue}</p><p>Join ICSH members, families and friends for an evening of food, friendship and community.</p></div><div className="our-event-forms"><h4>Share Iftari with us</h4><div className="our-event-form"><Link className="button" href="/ramadan-iftari-2027">{settings.status === 'published' ? 'Book your places ↗' : 'View event details ↗'}</Link>{settings.status !== 'published' && <p><strong>{settings.status === 'closed' ? 'Bookings are closed.' : 'Bookings opening soon.'}</strong></p>}<p>Adult members {gbp(settings.prices.member)} · non-members {gbp(settings.prices.nonmember)}<br/>Children aged 5–11 {gbp(settings.prices.child)} · under-5s {settings.prices.under5 === null ? 'price to be confirmed' : gbp(settings.prices.under5)}</p></div></div></article>;
  } catch { return null; }
}
