'use client';

import Link from 'next/link';
import {useEffect,useId,useRef,useState,type CSSProperties} from 'react';
import type {HomeEventForm} from '@/lib/home-event-forms';
import styles from './HomeEventForms.module.css';

const icons={participation:'M4 11h16M5 11a7 7 0 0014 0M12 4v3M8 5v2M16 5v2M8 20h8',stall:'M3 9l2-5h14l2 5M4 9v11h16V9M8 20v-6h8v6M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0',tickets:'M5 5h14v15H5zM8 3v4M16 3v4M5 10h14M9 14h1M14 14h1M9 17h1'};
export default function HomeEventForms({forms,available}:{forms:HomeEventForm[];available:boolean}){
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
 },[forms.length]);
 function move(direction:number){
  const element=track.current;
  if(!element)return;
  const gap=parseFloat(getComputedStyle(element).columnGap)||0;
  element.scrollBy({left:direction*(element.clientWidth+gap),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 }
 if(!forms.length)return <div className={styles.empty}><p>{available?'New events are on the way. Check back soon for ways to take part.':'Visit Events & Services for the latest ways to take part.'}</p><Link className="text-link" href="/events">View Events & Services <span aria-hidden="true">↗</span></Link></div>;
 return <div className={styles.carousel}>
  <ol ref={track} id={id} className={styles.track} data-single={forms.length===1?'true':undefined} aria-label="Open event forms, newest first" style={{'--event-columns':Math.min(4,forms.length)} as CSSProperties}>
   {forms.map(form=><li className={styles.card} key={form.href}><article>
    <div className={styles.top}><span className={styles.icon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icons[form.kind]}/></svg></span><span>{form.kind==='stall'?'Stall applications':form.kind==='participation'?'Get involved':'Event registration'}</span></div>
    <h3>{form.title}</h3><p className={styles.details}><time dateTime={form.date}>{form.dateLabel}</time><span>{form.venue}</span></p><p className={styles.summary}>{form.summary}</p>
    <Link href={form.href} className={styles.link} aria-label={`${form.label} — ${form.title}`}>{form.label}<span aria-hidden="true">↗</span></Link>
   </article></li>)}
  </ol>
  <div className={styles.bottom}><Link href="/events" className="text-link">View Events & Services <span aria-hidden="true">↗</span></Link><div className={styles.controls} hidden={!position.previous&&!position.next}><span aria-live="polite" aria-atomic="true">{position.start+1}–{Math.min(forms.length,position.start+position.count)} of {forms.length}</span><button type="button" aria-label="Previous event forms" aria-controls={id} disabled={!position.previous} onClick={()=>move(-1)}>←</button><button type="button" aria-label="Next event forms" aria-controls={id} disabled={!position.next} onClick={()=>move(1)}>→</button></div></div>
 </div>;
}
