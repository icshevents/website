import Link from 'next/link';
import {eventWhen,gbp,type Settings} from '@/lib/iftari/core';
export default function IftariEventCard({settings}:{settings:Settings}){
 return <article className="panel our-event-panel" id="ramadan-iftari-2027">
  <div className="our-event-summary">
   <div className="our-event-copy">
    <span className="tag">Ramadan · Community gathering</span>
    <h3>{settings.title}</h3>
    <p className="our-event-date"><strong>{eventWhen(settings)}</strong><br/>{settings.venue}</p>
    <p className="public-event-description">Join ICSH members, families and friends for an evening of food, friendship and community.</p>
   </div>
   <div className="our-event-forms">
    <p className="our-event-prices">Adult members {gbp(settings.prices.member)} · non-members {gbp(settings.prices.nonmember)}<br/>Children aged 5–11 {gbp(settings.prices.child)} · under-5s {settings.prices.under5===0?'Free':settings.prices.under5===null?'price to be confirmed':gbp(settings.prices.under5)}</p>
    {settings.status!=='published'&&<p className="public-booking-status"><strong>{settings.status==='closed'?'Bookings are closed.':'Bookings opening soon.'}</strong></p>}
    <div className="our-event-actions">
     <Link className="button" href="/ramadan-iftari-2027">{settings.status==='published'?'Book your places':'View event details'} ↗</Link>
    </div>
   </div>
  </div>
  <div className="our-event-artwork our-event-artwork--empty"><div className="our-event-artwork-placeholder"><span className="our-event-artwork-brand">ICSH</span><span>Event poster coming soon</span></div></div>
 </article>;
}
