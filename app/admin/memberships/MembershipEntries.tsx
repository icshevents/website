'use client';
import type {ReactNode} from 'react';
import EntryTable from '@/components/organiser/EntryTable';
type Entry={values:Record<string,unknown>;searchText:string;id:string;reference:string;member:ReactNode;contact:ReactNode;application:ReactNode;payment:ReactNode;membership:ReactNode;received:ReactNode;content:ReactNode};
export default function MembershipEntries({entries}:{entries:Entry[]}){
 return <EntryTable title="Saved membership applications" filename="icsh-membership-entries.csv" management={{kind:'membership'}} columns={['Member','Contact details','Application & fee','Payment','Membership','Received (UK)']} entries={entries.map(e=>({id:e.id,cells:[e.member,e.contact,e.application,e.payment,e.membership,e.received],values:e.values,details:e.content}))}/>;
}
