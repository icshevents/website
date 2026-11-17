export function entryValues(value:unknown,prefix=''):Record<string,unknown>{
 if(value===null||value===undefined)return {};
 if(Array.isArray(value))return {[prefix]:value.map(v=>typeof v==='object'?JSON.stringify(v):String(v)).join(' | ')};
 if(typeof value==='object')return Object.assign({},...Object.entries(value as Record<string,unknown>).map(([k,v])=>entryValues(v,prefix?prefix+' · '+k:k)));
 return {[prefix]:typeof value==='boolean'?(value?'Yes':'No'):value};
}
export const entryDate=(value:string)=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'}).format(new Date(value));
/** Call only after the appropriate portal session has been verified. */
export async function entryPages<T>(load:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:unknown}>):Promise<T[]>{const rows:T[]=[];for(let offset=0;;offset+=500){const r=await load(offset,offset+499);if(r.error||!r.data)throw Error('Entries are temporarily unavailable. Please retry.');rows.push(...r.data);if(r.data.length<500)return rows;}}
