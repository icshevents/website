/** Shared London-local display and edit helpers for current and future event forms.
 * Only the UI changes; stored event timestamps remain ISO UTC. */
const zone='Europe/London';
const longDate=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:zone});
const time24=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:zone});
const input24=new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:zone});
export const ukLongDate=value=>longDate.format(new Date(value));
export const ukTime=value=>time24.format(new Date(value));
export const ukLongDateTime=value=>ukLongDate(value)+' · '+ukTime(value);
export function ukInput(iso){
 if(!iso)return '';
 const p=input24.formatToParts(new Date(iso));
 const get=type=>p.find(part=>part.type===type)?.value;
 return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
/** Reject clock-change gaps and overlaps rather than silently altering times. */
export function ukISO(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw Error('Enter a valid UK date and time (DD/MM/YYYY, HH:mm).');
 const utc=Date.parse(value+'Z');
 const candidates=[utc,utc-3600000].filter(t=>Number.isFinite(t)&&ukInput(new Date(t).toISOString())===value);
 if(candidates.length!==1)throw Error('This UK time is affected by the GMT/BST clock change. Choose another time.');
 return new Date(candidates[0]).toISOString();
}
