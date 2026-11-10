import {randomInt} from 'node:crypto';
import type {BiginContact} from '../zoho/client.ts';
export function memberIdPrefix(firstName:string,lastName:string){const letters=(name:string)=>Array.from(name.normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}]/gu,'').toUpperCase());const first=letters(firstName),last=letters(lastName);if(!first.length||!last.length)throw new Error('MEMBER_ID_NAME_REQUIRED');return first.slice(0,2).join('').padEnd(2,'X')+last.slice(0,2).join('').padEnd(2,'X');}
export const validGeneratedMemberId=(value:unknown):value is string=>typeof value==='string'&&/^\p{L}{4}[0-9]{4}$/u.test(value);
export function generateMemberId(firstName:string,lastName:string,digits:()=>number=()=>randomInt(10000)){const value=digits();if(!Number.isInteger(value)||value<0||value>9999)throw new Error('MEMBER_ID_RANDOM_INVALID');return memberIdPrefix(firstName,lastName)+String(value).padStart(4,'0');}
export type MemberIdClient={getBiginContact(id:string):Promise<BiginContact>;searchBiginContactsByMemberId(value:string):Promise<{ids:string[];hasMore:boolean}>;updateBiginMemberId(id:string,value:string):Promise<void>};
export type MemberIdReservation={memberId:string;writeStarted:boolean;assigned:boolean};
export type MemberIdStorage={reserve(candidate:string,rejected?:string):Promise<MemberIdReservation|null>;start(value:string):Promise<boolean>;confirm(value:string):Promise<void>};
/** Preserve an existing identifier; generate once and read back before confirming. */
export async function ensureContactMemberId(client:MemberIdClient,id:string,identity:(contact:BiginContact)=>boolean,storage:MemberIdStorage,generate=generateMemberId){
 let contact=await client.getBiginContact(id);if(contact.id!==id||!identity(contact))throw new Error('MEMBER_ID_IDENTITY_MISMATCH');
 if(contact.memberId?.trim()){await storage.confirm(contact.memberId);return contact.memberId;}
 let rejected: string|undefined;
 for(let attempt=0;attempt<40;attempt++){
  const reservation=await storage.reserve(generate(contact.firstName||'',contact.lastName||''),rejected);if(!reservation)continue;const value=reservation.memberId;
  const matches=await client.searchBiginContactsByMemberId(value);
  if(matches.hasMore||matches.ids.some(other=>other!==id)){if(reservation.writeStarted)throw new Error('MEMBER_ID_COLLISION_REVIEW');rejected=value;continue;}
  contact=await client.getBiginContact(id);if(contact.id!==id||!identity(contact))throw new Error('MEMBER_ID_IDENTITY_MISMATCH');
  if(contact.memberId?.trim()){await storage.confirm(contact.memberId);return contact.memberId;}
  if(!await storage.start(value))throw new Error('MEMBER_ID_RESERVATION_CHANGED');
  await client.updateBiginMemberId(id,value);contact=await client.getBiginContact(id);
  if(contact.id!==id||!identity(contact)||contact.memberId!==value)throw new Error('MEMBER_ID_READBACK_PENDING');
  await storage.confirm(value);return value;
 }
 throw new Error('MEMBER_ID_RETRY_REQUIRED');
}
