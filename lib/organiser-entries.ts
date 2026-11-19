import {formatUKDate,formatUKDateTime} from './uk-date-time.ts';
export function entryValues(value:unknown,prefix=''):Record<string,unknown>{
 if(value===null||value===undefined)return {};
 if(Array.isArray(value)){if(value.length&&value.every(v=>v&&typeof v==='object'&&typeof v.firstName==='string'&&typeof v.lastName==='string'))return {[prefix]:value.map((v,i)=>`${i+1}. ${v.firstName} ${v.lastName}${v.ticket?' ('+v.ticket+')':''}`).join(' | ')};return {[prefix]:value.map(v=>typeof v==='object'?JSON.stringify(v):String(v)).join(' | ')};}
 if(typeof value==='object')return Object.assign({},...Object.entries(value as Record<string,unknown>).map(([k,v])=>entryValues(v,prefix?prefix+' · '+k:k)));
 return {[prefix]:typeof value==='boolean'?(value?'Yes':'No'):typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))?formatUKDate(value):typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))?formatUKDateTime(value):value};
}
export const entryDate=(value:string)=>formatUKDateTime(value);
/** Call only after the appropriate portal session has been verified. */
export async function entryPages<T>(load:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>):Promise<T[]>{const rows:T[]=[];for(let offset=0;;offset+=500){const r=await load(offset,offset+499);if(r.error||!r.data)throw Error('Entries are temporarily unavailable. Please retry.');rows.push(...r.data);if(r.data.length<500)return rows;}}

const bookingCurrency = new Intl.NumberFormat('en-GB', {style:'currency', currency:'GBP'});
const asRecord = (value:unknown):Record<string,unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
const asText = (value:unknown) => typeof value === 'string' ? value.trim() : '';
const quantity = (value:unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;

export function bookingEntryView(kind:string, details:Record<string,unknown>) {
  if (kind !== 'tickets' && kind !== 'iftari') return null;

  const {attendees, total, contact, quantities, quote, ...otherDetails} = details;
  const {attendees: contactAttendees, ...contactDetails} = asRecord(contact);
  const {total: quoteTotal, ...quoteDetails} = asRecord(quote);
  const iftari = kind === 'iftari';
  const savedAttendees = iftari ? contactAttendees : attendees;
  const people = Array.isArray(savedAttendees) ? savedAttendees.map(asRecord) : [];
  const names = people.map(({firstName, lastName, name}) => {
    const fullName = [asText(firstName), asText(lastName)].filter(Boolean).join(' ') || asText(name);
    return /^Guest \d+ \(name not collected\)$/i.test(fullName) ? '' : fullName;
  }).filter(Boolean);
  const ticketQuantities = asRecord(quantities);
  const adults = iftari ? quantity(ticketQuantities.member) + quantity(ticketQuantities.nonmember)
    : people.filter(person => person.ticket && person.ticket !== 'child').length;
  const children = iftari ? quantity(ticketQuantities.child) + quantity(ticketQuantities.under5)
    : people.filter(person => person.ticket === 'child').length;
  const amount = iftari ? quoteTotal : total;

  return {
    adults,
    children,
    total: typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0
      ? bookingCurrency.format(amount / 100) : null,
    booker: asText(contactDetails.name) || [asText(contactDetails.firstName), asText(contactDetails.lastName)].filter(Boolean).join(' '),
    names,
    unnamed: Math.max(people.length, adults + children) - names.length,
    details: iftari ? {...otherDetails, contact: contactDetails, quote: quoteDetails}
      : {...otherDetails, contact: contactDetails},
  };
}
