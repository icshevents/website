'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import styles from './HomeFeaturedEvents.module.css';

export type FeaturedEvent={slug:string;title:string;description:string;startsAt:string;venue:string;image:string};
const day=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeZone:'Europe/London'});
const time=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});
export default function HomeFeaturedEvents({events}:{events:FeaturedEvent[]}){
 const [current,setCurrent]=useState(0),[paused,setPaused]=useState(false),[reduceMotion,setReduceMotion]=useState(false),[interaction,setInteraction]=useState(0);
 const count=events.length;
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>setReduceMotion(media.matches);
  update();media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  if(count<2||paused||reduceMotion)return;
  const timer=window.setInterval(()=>{if(!document.hidden)setCurrent(i=>(i+1)%count);},5000);
  return()=>window.clearInterval(timer);
 },[count,paused,reduceMotion,interaction]);
 if(!count)return null;
 const index=Math.min(current,count-1),event=events[index],date=new Date(event.startsAt);
 const change=(next:number)=>{setCurrent((next+count)%count);setInteraction(n=>n+1);};
 return <section className={styles.section} aria-labelledby="featured-events-heading" onMouseEnter={()=>setPaused(true)}
  onMouseLeave={()=>setPaused(false)} onFocusCapture={()=>setPaused(true)}
  onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPaused(false);}}>
  <div className="wrap">
   <div className={styles.heading}>
    <div><div className="eyebrow">Coming up at ICSH</div><h2 id="featured-events-heading">Don't miss what's next.</h2></div>
    <Link href="/events" className="text-link">Explore all events <span aria-hidden="true">↗</span></Link>
   </div>
   <div className={styles.viewport} aria-live="off">
    <Link key={event.slug} href={'/events/'+event.slug} className={styles.card+(event.image?'':' '+styles.noPoster)}
     aria-label={'View '+event.title+' event details'}>
     <div className={styles.details}>
      <span className={styles.label}>Upcoming event <span aria-hidden="true">·</span> {index+1} of {count}</span>
      <h3>{event.title}</h3>
      <p className={styles.date}><time dateTime={event.startsAt}>{day.format(date)} · {time.format(date)} (UK time)</time></p>
      <p className={styles.venue}>{event.venue}</p>
      <p className={styles.description}>{event.description}</p>
      <span className={styles.readMore}>View event details <span aria-hidden="true">↗</span></span>
     </div>
     {event.image&&<div className={styles.artwork}><img src={event.image} alt={event.title+' poster or leaflet'}/></div>}
    </Link>
   </div>
   {count>1&&<div className={styles.controls} aria-label="Featured event carousel controls">
    <div className={styles.dots}>
     {events.map((item,i)=><button key={item.slug} type="button" className={styles.dot+(i===index?' '+styles.selected:'')}
      onClick={()=>change(i)} aria-label={'Show '+item.title} aria-current={i===index?'true':undefined}/>)}
    </div>
    <div className={styles.arrows}>
     <button type="button" onClick={()=>change(index-1)} aria-label="Previous featured event">←</button>
     <button type="button" onClick={()=>change(index+1)} aria-label="Next featured event">→</button>
    </div>
   </div>}
  </div>
 </section>;
}
