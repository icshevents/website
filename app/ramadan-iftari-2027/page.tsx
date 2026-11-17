import {bookingAccess} from '@/lib/events-hub/booking-access';
import {publicEvents} from '@/lib/events-hub/server';
import {notFound} from 'next/navigation';
import EventView from '@/components/events-hub/EventView';
import '@/components/events-hub/hub.css';
import { PageHero } from '@/components/Shared';
import BookingForm from './BookingForm';
import MenuPopup from './MenuPopup';
import noticeStyles from './booking-notice.module.css';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ramadan Iftari 2027 – Book your places', description: 'Join ICSH members, families and friends for Ramadan Iftari at The Clay Oven Restaurant, Wembley.', alternates: { canonical: '/ramadan-iftari-2027' } };
export default async function IftariPage() {
  const catalog=await publicEvents('ramadan-iftari-2027');
  if(catalog!==null){const e=catalog[0];if(!e)notFound();const access=await bookingAccess('iftari','ramadan-iftari-2027');return <><section className="section"><div className="wrap">{e.status==='published'&&!access.canBook&&<div className={noticeStyles.banner} role="status"><h2>{e.content.bookingOpens&&Date.parse(e.content.bookingOpens)>Date.now()?'Bookings opening soon.':'Bookings are currently closed.'}</h2><p>You can view the menu and ticket prices below.</p></div>}<EventView content={e.content} slug={e.slug} status={e.status} sourceType="iftari" hideBookingLink/>{e.status==='published'&&!access.canBook&&<MenuPopup/>}</div></section>{e.status==='published'&&access.canBook&&<section className="section white" style={{padding:0}}><BookingForm/></section>}</>;}
  return <><PageHero label="ICSH · Ramadan Iftari 2027" title="Break your fast. Share the warmth." description="An evening for members, families and friends at The Clay Oven Restaurant, Wembley." /><section className="section white" style={{ padding: 0 }}><BookingForm /></section></>;
}
