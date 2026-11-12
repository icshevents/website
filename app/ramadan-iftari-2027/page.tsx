import { PageHero } from '@/components/Shared';
import BookingForm from './BookingForm';
export const metadata = { title: 'Ramadan Iftari 2027 – Book your places', description: 'Join ICSH members, families and friends for Ramadan Iftari at The Clay Oven Restaurant, Wembley.', alternates: { canonical: '/ramadan-iftari-2027' } };
export default function IftariPage() {
  return <><PageHero label="ICSH · Ramadan Iftari 2027" title="Break your fast. Share the warmth." description="An evening for members, families and friends at The Clay Oven Restaurant, Wembley." /><section className="section white" style={{ padding: 0 }}><BookingForm /></section></>;
}
