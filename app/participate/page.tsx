import Link from 'next/link';
import {participationEvents} from '@/lib/participation-links';
import styles from './participate.module.css';

export const dynamic='force-dynamic';
export const metadata={title:'Participate',description:'Your quick links to ICSH membership, open event forms, the Rishta service and donations.',alternates:{canonical:'/participate'}};
function FormLink({href,title,note,comingSoon=false}:{href:string;title:string;note?:string;comingSoon?:boolean}){return <Link className={`${styles.formLink} ${comingSoon?styles.comingSoon:''}`} href={href}><span><strong>{title}</strong>{note&&<small>{note}</small>}</span><span className={styles.arrow} aria-hidden="true">↗</span></Link>;}
export default async function Participate(){
 const directory=await participationEvents();
 return <section className={styles.page}><div className={styles.card}>
  <header className={styles.intro}><Link href="/" aria-label="ICSH homepage"><img src="/assets/icsh-logo.webp" alt="ICSH" width="88" height="88"/></Link><span className={styles.brand}>Society of Harrow · Est. 1976</span><h1>Participate</h1><p>All the ways to get involved,<br/>in one place.</p></header>
  <div className={styles.groups}>
   <section aria-labelledby="participate-membership"><h2 id="participate-membership">Membership</h2><div className={styles.links}><FormLink href="/membership?category=new#join" title="Join ICSH" note="Start your membership"/><FormLink href="/membership?category=renewal#join" title="Renew your membership" note="Another year of community"/></div><Link className={styles.smallLink} href="/membership/search">Check your membership dates <span aria-hidden="true">↗</span></Link></section>
   <section aria-labelledby="participate-events"><h2 id="participate-events">Open event forms</h2>{!directory.available?<div className={styles.notice}><p>Event links are temporarily unavailable.</p><Link href="/events">Visit Events & Services ↗</Link></div>:directory.events.length===0?<div className={styles.notice}><p>No event forms are open at the moment.</p><Link href="/events">See what’s coming up ↗</Link></div>:directory.events.map(event=><div className={styles.eventGroup} key={event.id}><h3>{event.title}</h3><div className={styles.links}>{event.forms.map(form=><FormLink key={form.url} href={new URL(form.url).pathname} title={form.label} note={form.kind==='stall'?'Stallholder application':form.kind==='participation'?'Take part in the festival':'Event registration'}/>)}</div></div>)}</section>
   <section aria-labelledby="participate-service"><h2 id="participate-service">Community services</h2><FormLink href="/rishta-service" title="Rishta service" note="Confidential marriage introductions"/></section>
   <section aria-labelledby="participate-donate"><h2 id="participate-donate">Support our community</h2><FormLink href="/donate" title="Donate to ICSH" note="Make a one-off donation"/></section>
  </div>
  <footer className={styles.footer}><span>Community. Friendship. Belonging.</span><Link href="/">Visit our website <span aria-hidden="true">↗</span></Link></footer>
 </div></section>;
}
