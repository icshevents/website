'use client';

import Link from 'next/link';
import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import type {HomeUpcomingEvent} from '@/lib/home-event-forms';
import styles from './HomeEventForms.module.css';

const calendarIcon='M5 5h14v15H5zM8 3v4M16 3v4M5 10h14M9 14h1M14 14h1M9 17h1';
export default function HomeEventForms({events,available}:{events:HomeUpcomingEvent[];available:boolean}){
 const id=useId();
 const track=useRef<HTMLOListElement>(null);
 const [position,setPosition]=useState({start:0,count:4,previous:false,next:false});
 useEffect(()=>{
  const element=track.current;
  if(!element)return;
  function measure(){
   if(!element)return;
   const width=element.firstElementChild?.getBoundingClientRect().width??element.clientWidth;
   const gap=parseFloat(getComputedStyle(element).columnGap)||0;
   const count=Math.max(1,Math.round((element.clientWidth+gap)/(width+gap)));
   const start=Math.max(0,Math.round(element.scrollLeft/(width+gap)));
   const next=element.scrollLeft+element.clientWidth<element.scrollWidth-2;
   const previous=element.scrollLeft>2;
   setPosition(old=>old.start===start&&old.count===count&&old.previous===previous&&old.next===next?old:{start,count,previous,next});
  }
  const observer=new ResizeObserver(measure);
  observer.observe(element);element.addEventListener('scroll',measure,{passive:true});measure();
  return ()=>{observer.disconnect();element.removeEventListener('scroll',measure);};
 },[events.length]);
 function move(direction:number){
  const element=track.current;
  if(!element)return;
  const gap=parseFloat(getComputedStyle(element).columnGap)||0;
  element.scrollBy({left:direction*(element.clientWidth+gap),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 if(!events.length)return <div className={styles.empty}><p>{available?'New events are on the way. Check back soon for ways to take part.':'Visit Events & Services for the latest ways to take part.'}</p><Link className="text-link" href="/events">View Events & Services <span aria-hidden="true">↗</span></Link></div>;
 return <div className={styles.carousel}>
  <ol ref={track} id={id} className={styles.track} data-single={events.length===1?'true':undefined} aria-label="Upcoming events" style={{'--event-columns':Math.min(4,events.length)} as CSSProperties}>
   {events.map(event=><li className={styles.card} key={event.id}><article>
    <div className={styles.top}><span className={styles.icon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={calendarIcon}/></svg></span></div>
    <h3>{event.title}</h3><p className={styles.details}><time dateTime={event.date}>{event.dateLabel}</time><span>{event.venue}</span></p><p className={styles.summary}>{event.summary}</p>
    <div>{event.links.map(link=><Link key={link.href} href={link.href} className={styles.link} aria-label={`${link.label} — ${event.title}`}>{link.label}<span aria-hidden="true">↗</span></Link>)}</div>
   </article></li>)}
  </ol>
  <div className={styles.bottom}><Link href="/events" className="text-link">View Events & Services <span aria-hidden="true">↗</span></Link><div className={styles.controls} hidden={!position.previous&&!position.next}><span aria-live="polite" aria-atomic="true">{position.start+1}–{Math.min(events.length,position.start+position.count)} of {events.length}</span><button type="button" aria-label="Previous events" aria-controls={id} disabled={!position.previous} onClick={()=>move(-1)}>←</button><button type="button" aria-label="Next events" aria-controls={id} disabled={!position.next} onClick={()=>move(1)}>→</button></div></div>
 </div>;
}
