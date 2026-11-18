import MenuPopup from '@/app/ramadan-iftari-2027/MenuPopup';
import {resolveEventMenu} from '@/lib/events-hub/iftari-menu';
import Link from 'next/link';
import {Arrow} from './Shared';
import {bookingState} from '@/lib/events-hub/core';
import type {PublicEvent} from '@/lib/events-hub/server';
import {londonDate,londonTime} from '@/lib/event-directory';

const money=(n:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n/100);

export default function PublicEventCard({event:e}:{event:PublicEvent}){
 const c=e.content,cancelled=e.status==='cancelled',state=cancelled?'Closed':bookingState(c);
 const bookingUrl=c.bookingType==='external'?c.externalUrl:e.sourceType==='iftari'?'/ramadan-iftari-2027':e.sourceType==='tickets'?'/event-tickets/'+e.slug:'';
 const forms=cancelled?[]:e.forms||[];
 const bookingButton=Boolean(bookingUrl)&&!cancelled&&(state==='Open'||e.sourceType==='iftari');
 const posterClickable=e.slug==='icsh-winter-lunch-2026'&&Boolean(bookingUrl)&&!cancelled;
 const poster=<img className="public-event-poster" src={c.image} alt={c.title+' poster or leaflet'}/>;
 return <article className="panel our-event-panel" id={e.slug}>
  <div className="our-event-summary">
   <div className="our-event-copy">
    <span className="tag">{cancelled?'Cancelled':e.sourceType==='iftari'?'Ramadan · Community gathering':'ICSH community event'}</span>
    <h3>{c.title}</h3>
    <p className="our-event-date"><strong>{londonDate(c.startsAt)}</strong><br/>{londonTime(c.startsAt)} – {londonTime(c.endsAt)} (UK time)<br/>{c.venue}{c.address&&<><br/>{c.address}</>}</p>
    <p className="public-event-description">{c.description}</p>
    {cancelled&&<p className="public-event-cancelled"><strong>This event has been cancelled.</strong></p>}
   </div>
   <div className="our-event-forms">
    {c.bookingType==='paid'&&<p className="our-event-prices">Adult members {money(c.prices.member)} · non-members {money(c.prices.nonmember)}{c.childTickets&&<><br/>{e.sourceType==='iftari'?<>Children aged 5–11 {money(c.prices.child)} · under-5s {c.prices.under5===0?'Free':money(c.prices.under5)}</>:<>Children: members {money(c.prices.child)} · non-members {money(c.prices.childNonmember)}</>}</>}</p>}
    {c.bookingType==='free'&&<p className="our-event-prices"><strong>Free event</strong></p>}
    {bookingUrl&&!cancelled&&state!=='Open'&&<p className="public-booking-status"><strong>{state==='Not yet open'?'Bookings opening soon.':state==='Sold Out'?'This event is sold out.':'Bookings are closed.'}</strong></p>}
    <div className="our-event-actions">
     {bookingButton&&<a className="button" href={bookingUrl}>{state==='Open'?'Book your places':'View event'} <Arrow/></a>}
     {forms.map((f,i)=><Link className={'button '+(i?'outline':'')} href={f.url} key={f.url}>{f.title} <Arrow/></Link>)}
     {!cancelled&&<MenuPopup menu={resolveEventMenu(c.menu,e.sourceType)} eventTitle={c.title} compact/>}
     <Link className="button outline public-event-details" href={'/events/'+e.slug}>View event details <Arrow/></Link>
    </div>
   </div>
  </div>
  <div className={'our-event-artwork'+(c.image?'':' our-event-artwork--empty')}>
   {c.image?(posterClickable?<a href={bookingUrl} aria-label={'Book your places for '+c.title}>{poster}</a>:poster):<div className="our-event-artwork-placeholder"><span className="our-event-artwork-brand">ICSH</span><span>Event poster coming soon</span></div>}
  </div>
 </article>;
}
