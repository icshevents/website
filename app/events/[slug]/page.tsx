import FormLinks from '@/components/events-hub/FormLinks';
import {notFound} from 'next/navigation';
import Link from 'next/link';
import EventView from '@/components/events-hub/EventView';
import {publicEvents} from '@/lib/events-hub/server';
import '@/components/events-hub/hub.css';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const event=(await publicEvents(slug))?.[0];return {title:event?.content.title||'ICSH event',description:event?.content.description.slice(0,160),alternates:{canonical:'/events/'+slug}};}
export default async function EventPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const event=(await publicEvents(slug))?.[0];if(!event)notFound();return <section className="section"><div className="wrap"><Link className="text-link" href="/events">← All events</Link><EventView content={event.content} slug={event.slug} status={event.status} sourceType={event.sourceType} sourceKey={event.sourceKey}/><FormLinks forms={event.forms}/></div></section>;}
