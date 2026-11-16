import Link from 'next/link';
import {notFound} from 'next/navigation';
import {publicCustomForm} from '@/lib/events-hub/custom-forms-server';
import PublicForm from '@/components/events-hub/PublicForm';
import '@/components/events-hub/hub.css';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const form=await publicCustomForm((await params).slug);return {title:form?.title||'Event form',robots:{index:false,follow:false}};}
export default async function EventFormPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const form=await publicCustomForm(slug);if(!form)notFound();return <section className="section"><div className="wrap hub-narrow"><Link className="text-link" href={'/events/'+form.eventSlug}>← {form.eventTitle}</Link><PublicForm slug={slug}/></div></section>;}
