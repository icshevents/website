import Link from 'next/link';
import {PageHero,Photo,Arrow,CTA} from '@/components/Shared';
import {displayDate} from '@/lib/content';
import {getEventDirectory,londonDate,londonTime} from '@/lib/event-directory';
import events from '@/content/events.json';
export const metadata={title:'Our Events',description:'Explore ICSH events, get involved in Harrow Food Festival and find event application forms.',alternates:{canonical:'/events'}};
export const dynamic='force-dynamic';
const gbp=(n:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n/100);
export default async function Events(){
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});
 const directory=await getEventDirectory();
 const upcomingForms=directory.events.filter(e=>new Date(e.endsAt).toLocaleDateString('en-CA',{timeZone:'Europe/London'})>=today);
 const upcoming=events.filter(e=>e.end>=today).sort((a,b)=>a.start.localeCompare(b.start));
 const past=events.filter(e=>e.end<today).sort((a,b)=>b.start.localeCompare(a.start));
 return <>
  <PageHero label="ICSH · Events & community" title="Our Events" description="Find your next gathering, support a good cause and discover ways to get involved with ICSH."/>
  <section className="section white our-events-section"><div className="wrap">
   <div className="section-head our-events-heading"><div><div className="eyebrow">Coming together</div><h2>What’s on at ICSH</h2></div><Link className="button outline" href="/admin">Organiser sign in <Arrow/></Link></div>
   {upcomingForms.length>0&&<div className="notice event-test-notice"><strong>Event forms are currently in test mode.</strong>Please use fictional details when trying the forms. Payments are simulated and no money is collected.</div>}
   {!directory.available&&<div className="notice"><strong>The latest event forms are temporarily unavailable here.</strong><p>Please try again shortly or contact the ICSH committee.</p><Link className="text-link" href="/contact">Contact ICSH <Arrow/></Link></div>}
   {directory.available&&upcomingForms.length===0&&upcoming.length===0&&<div className="notice"><strong>New dates will be announced soon</strong>Follow ICSH or contact the committee for news of the next event. We’ll publish dates and booking details here.</div>}
   <div className="our-event-list">{upcomingForms.map(e=><article className="panel our-event-panel" id={'registration-'+e.id} key={e.id}>
    <div className="our-event-summary"><span className="tag">Community event · test forms</span><h3>{e.title}</h3><p className="our-event-date"><strong>{londonDate(e.startsAt)}</strong><br/>{londonTime(e.startsAt)} – {londonTime(e.endsAt)} (UK time)<br/>{e.venue}</p><p>{e.description}</p></div>
    <div className="our-event-forms"><h4>Get involved</h4>{e.forms.map(form=><div className="our-event-form" key={form.url}><a className={'button '+(form.kind==='stall'?'outline':'')} href={form.url}>{form.label} <Arrow/></a><p>{form.kind==='participation'?'Free to complete · cooks, donors and volunteers welcome':form.kind==='stall'?`Stall hire from ${gbp(form.feeFromPence??0)} · application subject to approval`:form.feeFromPence!==undefined?`Tickets from ${gbp(form.feeFromPence)} · test rates`:''}</p></div>)}</div>
   </article>)}</div>
   {upcoming.map(e=><article className="panel" id={e.id} key={e.id}><h3>{e.title}</h3><p>{displayDate(e.start)} · {e.location}</p><p>{e.description}</p>{e.bookingUrl&&<a className="button" href={e.bookingUrl}>Book this event <Arrow/></a>}</article>)}
   <p className="our-event-admin-note">For ICSH organisers: <Link className="text-link" href="/admin">Organiser sign in <Arrow/></Link>. Manage form settings and review registrations in the website’s private workspace.</p>
  </div></section>
  <section className="section"><div className="wrap"><div className="eyebrow">Together, throughout the year</div><h2>The activities that<br/>bring us together.</h2><p>Our programme includes community gatherings, cultural celebrations, shared lunches, food festivals and charity fundraising, summer picnics, sports outings and quiz nights.</p></div></section>
  <section className="section white"><div className="wrap"><div className="eyebrow">Past events</div><h2>Good times, remembered.</h2>{past.map(e=><article className="archive-grid" id={e.id} key={e.id}><div><span className="tag">Past event</span><h3>{e.title}</h3><p><strong>{displayDate(e.start)}{e.end!==e.start?' – '+displayDate(e.end):''}</strong>{e.time?' · '+e.time:''}<br/>{e.location}</p><p>{e.description}</p>{e.price&&<p>{e.price}</p>}<div className="actions">{e.blogSlug&&<Link className="text-link" href={'/blog/'+e.blogSlug}>Read the story <Arrow/></Link>}</div></div><Photo src={e.image} alt={e.title==='Norwegian Fjords Cruise 2026'?'ICSH members enjoying a boat trip through Norwegian scenery':'Dr Hina Shahid'}/></article>)}</div></section><CTA/>
 </>;
}
