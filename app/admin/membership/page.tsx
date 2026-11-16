import Link from 'next/link';
import {redirect} from 'next/navigation';
import {PageHero} from '@/components/Shared';
import {organiserSession} from '@/lib/supabase/server';
import {signOut} from '../actions';
import AdminHubView from '@/components/events-hub/AdminHubView';
import '@/components/events-hub/hub.css';
export default async function AdminHub(){const session=await organiserSession();if(session.status==='signed-out')redirect('/admin/sign-in');if(session.status!=='organiser')return <section className="section"><div className="wrap"><h1>Admin Hub unavailable</h1><p>Please sign in again or retry shortly.</p><Link href="/admin/sign-in">Admin sign in</Link></div></section>;
 return <><PageHero label="ICSH · Organisers" title="Admin Hub" description="Membership, Rishta and donation entries, with simple access management for the Events Hub."/><AdminHubView toolbar={<form action={signOut}><button className="button outline">Sign out</button></form>}/></>;
}
