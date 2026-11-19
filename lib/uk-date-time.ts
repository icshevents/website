/** ICSH public and organiser-facing dates. Stored ISO timestamps are not changed. */
export const UK_TIME_ZONE='Europe/London' as const;
const asDate=(value:string|Date|number):Date=>new Date(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00Z':value);
const shortDate=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:UK_TIME_ZONE});
const longDate=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:UK_TIME_ZONE});
const time24=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:UK_TIME_ZONE});
export const formatUKDate=(value:string|Date|number):string=>shortDate.format(asDate(value));
export const formatUKLongDate=(value:string|Date|number):string=>longDate.format(asDate(value));
export const formatUKTime=(value:string|Date|number):string=>time24.format(asDate(value));
export const formatUKDateTime=(value:string|Date|number):string=>formatUKDate(value)+' '+formatUKTime(value);
export const formatUKLongDateTime=(value:string|Date|number):string=>formatUKLongDate(value)+' · '+formatUKTime(value);
