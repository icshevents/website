import {notFound} from 'next/navigation';
import Link from 'next/link';
import PublicEventCard from '@/components/PublicEventCard';
import {publicEvents} from '@/lib/events-hub/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;
 const event=(await publicEvents(slug))?.[0];
 return {title:event?.content.title||'ICSH event',description:event?.content.description.slice(0,160),alternates:{canonical:'/events/'+slug}};
}

export default async function EventPage({params}:{params:Promise<{slug:string}>}) {
 const {slug}=await params;
 const event=(await publicEvents(slug))?.[0];
 if(!event)notFound();

 return <section className="section white our-events-section">
  <div className="wrap">
   <Link className="text-link" href="/events">← All events</Link>
   <div className="our-event-list">
    <PublicEventCard event={event} firstPoster detail/>
   </div>
  </div>
 </section>;
}
