import {bookingAccess} from '@/lib/events-hub/booking-access';
import {publicEvents} from '@/lib/events-hub/server';
import {notFound} from 'next/navigation';
import EventView from '@/components/events-hub/EventView';
import '@/components/events-hub/hub.css';
import { PageHero } from '@/components/Shared';
import BookingForm from './BookingForm';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ramadan Iftari 2027 – Book your places', description: 'Join ICSH members, families and friends for Ramadan Iftari at The Clay Oven Restaurant, Wembley.', alternates: { canonical: '/ramadan-iftari-2027' } };
export default async function IftariPage() {
  const catalog=await publicEvents('ramadan-iftari-2027');
  if(catalog!==null){const e=catalog[0];if(!e)notFound();const access=await bookingAccess('iftari','ramadan-iftari-2027');return <><section className="section"><div className="wrap"><EventView content={e.content} slug={e.slug} status={e.status} sourceType="iftari" hideBookingLink/></div></section>{e.status==='published'&&access.canBook&&<section className="section white" style={{padding:0}}><BookingForm/></section>}{e.status==='published'&&!access.canBook&&<section className="section white"><div className="wrap"><div className="notice"><strong>{e.content.bookingOpens&&Date.parse(e.content.bookingOpens)>Date.now()?'Bookings opening soon.':'Bookings are currently closed.'}</strong></div></div></section>}</>;}
  return <><PageHero label="ICSH · Ramadan Iftari 2027" title="Break your fast. Share the warmth." description="An evening for members, families and friends at The Clay Oven Restaurant, Wembley." /><section className="section white" style={{ padding: 0 }}><BookingForm /></section></>;
}
