import { redirect } from 'next/navigation';
import { PageHero } from '@/components/Shared';
import { organiserSession } from '@/lib/supabase/server';
import IftariAdmin from './IftariAdmin';
export const dynamic = 'force-dynamic';
export default async function IftariSettings() {
  const access = await organiserSession();
  if (access.status === 'signed-out') redirect('/admin/sign-in');
  if (access.status !== 'organiser') return <section className="section white"><div className="wrap"><h1>Organiser access required</h1><p>Your organiser access could not be confirmed.</p></div></section>;
  return <><PageHero label="ICSH · Organisers" title="Ramadan Iftari 2027" description="Manage event details, ticket prices, availability and bookings." /><section className="section white"><div className="wrap"><IftariAdmin /></div></section></>;
}
