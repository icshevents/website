import {publicEvents,publicPastEvents} from '@/lib/events-hub/server';
import PublicEventCard from '@/components/PublicEventCard';
import PastEventsCarousel from '@/components/PastEventsCarousel';
import Link from 'next/link';
import {PageHero,Arrow,CTA} from '@/components/Shared';
import {displayDate} from '@/lib/content';
import {getEventDirectory,londonDate,londonTime} from '@/lib/event-directory';
import events from '@/content/events.json';
import IftariEventCard from '@/components/IftariEventCard';
import {iftariSettings} from '@/lib/iftari/server';
export const metadata={title:'Events & Services',description:'Explore ICSH events, get involved in Harrow Food Festival and find event application forms.',alternates:{canonical:'/events'}};
export const dynamic='force-dynamic';
const gbp=(n:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n/100);
export default async function Events(){
 const [managed,completed]=await Promise.all([publicEvents(),publicPastEvents()]);
 if(managed!==null){const next=managed.filter(e=>e.status!=='completed').sort((a,b)=>Date.parse(a.content.startsAt)-Date.parse(b.content.startsAt));const firstPoster=next.find(e=>e.content.image);return <>
 <PageHero className="events-page-hero" label="ICSH · Events & services" title="Events & Services" description="Find your next gathering, explore our community services and support good causes."/>
 <section className="section white our-events-section"><div className="wrap">{next.length===0&&<div className="notice"><strong>New dates will be announced soon</strong>We’ll publish dates and booking details here.</div>}<div className="our-event-list">{next.map(e=><PublicEventCard key={e.id} event={e} firstPoster={e===firstPoster}/>)}</div></div></section>
 <section className="section services-directory"><div className="wrap"><div className="eyebrow">Here for our community</div><h2>Community services</h2><div className="service-directory-grid"><article className="panel"><span className="tag">Introductions & connection</span><h3>Rishta service</h3><p>A confidential, community-supported service for people seeking a life partner.</p><Link className="button" href="/rishta-service">Explore Rishta service <Arrow/></Link></article></div></div></section>
 <PastEventsCarousel events={(completed||[]).map(e=>({id:e.id,title:e.content.title,date:londonDate(e.content.startsAt),venue:e.content.venue,description:e.content.description,image:e.content.image,story:e.sourceType==='archive'?events.find(a=>a.id===e.sourceKey)?.blogSlug:undefined}))}/>
 <CTA/><section className="section white"><div className="wrap" style={{display:'flex',justifyContent:'flex-end'}}><Link className="button outline" href="/admin">Organiser sign in <Arrow/></Link></div></section></>;}
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});
 const [directory,iftari]=await Promise.all([getEventDirectory(),iftariSettings().catch(()=>null)]);
 const upcomingForms=directory.events.filter(e=>new Date(e.endsAt).toLocaleDateString('en-CA',{timeZone:'Europe/London'})>=today);
 const upcoming=events.filter(e=>e.end>=today).sort((a,b)=>a.start.localeCompare(b.start));
 const past=events.filter(e=>e.end<today).sort((a,b)=>b.start.localeCompare(a.start));
 const cards=[
  ...upcomingForms.map(e=>({date:e.startsAt.slice(0,10),node:(<article className="panel our-event-panel our-event-panel--no-poster" id={'registration-'+e.id} key={e.id}>
    <div className="our-event-summary"><div className="our-event-copy"><span className="tag">Community event</span><h3>{e.title}</h3><p className="our-event-date"><strong>{londonDate(e.startsAt)}</strong><br/>{londonTime(e.startsAt)} – {londonTime(e.endsAt)} (UK time)<br/>{e.venue}</p><p className="public-event-description">{e.description}</p></div>
    <div className="our-event-forms"><div className="our-event-actions">{e.forms.map(form=><a className={'button '+(form.kind==='stall'?'outline':'')} href={form.url} key={form.url}>{form.label} <Arrow/></a>)}</div></div></div>
   </article>)})),
  ...upcoming.map(e=>({date:e.start,node:(<article className={'panel our-event-panel'+(e.image?'':' our-event-panel--no-poster')} id={e.id} key={e.id}><div className="our-event-summary"><div className="our-event-copy"><span className="tag">ICSH community event</span><h3>{e.title}</h3><p className="our-event-date">{displayDate(e.start)} · {e.location}</p><p className="public-event-description">{e.description}</p></div><div className="our-event-forms"><div className="our-event-actions">{e.bookingUrl&&<a className="button" href={e.bookingUrl}>Book this event <Arrow/></a>}</div></div></div>{e.image&&<div className="our-event-artwork"><img className="public-event-poster" src={e.image} alt={e.title+' poster or leaflet'}/></div>}</article>)})),
  ...(iftari&&(!iftari.date||iftari.date>=today)?[{date:iftari.date||'9999-12-31',node:<IftariEventCard key="ramadan-iftari-2027" settings={iftari}/>}]:[]),
 ].sort((a,b)=>a.date.localeCompare(b.date));
 return <>
  <PageHero className="events-page-hero" label="ICSH · Events & services" title="Events & Services" description="Find your next gathering, explore our community services and support good causes."/>
  <section className="section white our-events-section"><div className="wrap">
   {!directory.available&&<div className="notice"><strong>The latest event forms are temporarily unavailable here.</strong><p>Please try again shortly or contact the ICSH committee.</p><Link className="text-link" href="/contact">Contact ICSH <Arrow/></Link></div>}
   {directory.available&&cards.length===0&&<div className="notice"><strong>New dates will be announced soon</strong>Follow ICSH or contact the committee for news of the next event. We’ll publish dates and booking details here.</div>}
   <div className="our-event-list">{cards.map(card=>card.node)}</div>


  </div></section>
  <section className="section services-directory"><div className="wrap"><div className="eyebrow">Here for our community</div><h2>Community services</h2><div className="service-directory-grid"><article className="panel"><span className="tag">Introductions & connection</span><h3>Rishta service</h3><p>A confidential, community-supported service for people seeking a life partner.</p><Link href="/rishta-service" className="button">Explore Rishta service <Arrow/></Link></article></div></div></section>
  <PastEventsCarousel events={past.map(e=>({id:e.id,title:e.title,date:displayDate(e.start),venue:e.location,description:e.description,image:e.image,story:e.blogSlug}))}/><CTA/><section className="section white"><div className="wrap" style={{display:'flex',justifyContent:'flex-end'}}><Link className="button outline" href="/admin">Organiser sign in <Arrow/></Link></div></section>
 </>;
}
