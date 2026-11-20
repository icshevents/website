'use client';
import {useEffect,useState} from 'react';
import {londonInput,londonISO} from '@/lib/events-hub/core';
import {emptyDiscount,normaliseCode,type DiscountConfiguration} from '@/lib/event-discounts/core';
import {notifyWorkspace} from '@/components/organiser/WorkspaceNotifications';

type Stats={used:number;reserved:number;remaining:number;totalDiscountPence:number};
type Entry=DiscountConfiguration&Stats;
const gbp=(pence:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(pence/100);
const dates=(value:string|null)=>value?londonInput(value):'';
const display=(n:number|null)=>n===null?'Unlimited':String(n);
export default function EventDiscounts({eventId,formId,kind,api,onBack}:{eventId:string;formId:string;kind:'tickets'|'iftari';api:(path:string,body?:unknown)=>Promise<any>;onBack:()=>void}){
 const [rows,setRows]=useState<Entry[]>([]),[editing,setEditing]=useState<Entry|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[loaded,setLoaded]=useState(false);
 const [start,setStart]=useState(''),[end,setEnd]=useState('');
 async function reload(){
  const result=await api('discounts?eventId='+encodeURIComponent(eventId)+'&formId='+encodeURIComponent(formId));
  if(!Array.isArray(result))throw Error('Discount settings could not be loaded.');
  setRows(result);setLoaded(true);
 }
 useEffect(()=>{setLoaded(false);setEditing(null);reload().catch(e=>setMessage(e.message));},[eventId,formId]);
 const open=(entry:Entry)=>{setEditing({...entry});setStart(dates(entry.startsAt));setEnd(dates(entry.expiresAt));setMessage('');};
 const blank=():Entry=>({...emptyDiscount(kind,formId),used:0,reserved:0,remaining:0,totalDiscountPence:0});
 const update=(change:Partial<Entry>)=>setEditing(old=>old?{...old,...change}:null);
 async function save(){
  if(!editing)return;
  setBusy(true);setMessage('');
  try{
   if(editing.active){
    normaliseCode(editing.code||'');
    if(editing.value<=0||editing.maximum<1)throw Error('Enter a discount value and maximum number of redemptions before activating.');
   }
   const offer:DiscountConfiguration={
    id:editing.id,scopeKind:kind,scopeId:formId,
    code:editing.code?normaliseCode(editing.code):null,
    name:editing.name,basis:editing.basis,value:editing.value,
    categories:editing.categories,application:editing.application,
    redemptionBasis:editing.redemptionBasis,maximum:editing.maximum,
    perCustomerMaximum:editing.perCustomerMaximum,
    startsAt:start?londonISO(start):null,expiresAt:end?londonISO(end):null,
    paidMembersOnly:editing.paidMembersOnly,active:editing.active,version:editing.version
   };
   await api('discount/save',{eventId,formId,discount:offer});
   await reload();setEditing(null);setMessage('Early Bird settings saved.');notifyWorkspace('Discount settings saved.');
  }catch(e){const text=e instanceof Error?e.message:'Could not save discount settings.';setMessage(text);notifyWorkspace(text,'error');}finally{setBusy(false);}
 }
 return <section className="panel hub-fields" aria-label="Early Bird Discounts">
  <div className="hub-toolbar"><div><h3>Early Bird Discounts</h3><p>Manage discounts for this booking form only. Other events and annual copies have separate codes and limits.</p></div><button type="button" className="button outline" onClick={onBack}>Back to forms</button></div>
  {!editing&&<><p>Discounts start inactive. Create a code, choose its value and usage limit, then activate it. Only one code can be applied to each booking.</p>
   <div className="actions"><button type="button" className="button" disabled={busy||!loaded} onClick={()=>open(blank())}>+ Add discount code</button></div>
   {loaded&&rows.map(item=><article className="hub-managed-form" key={item.id||'placeholder'}>
    <div><strong>{item.name} {item.code?'· '+item.code:'· Not configured'}</strong>
     <p>{item.active?(item.remaining>0?'Active':'Limit reached'):'Inactive'} · {item.basis==='fixed'?gbp(item.value):item.value+'%'} · {item.categories==='all'?'All paid tickets':item.categories==='adult'?'Adult tickets':'Child tickets'}</p>
     <p><strong>{item.used} successful redemptions</strong> · {item.reserved} reserved · {item.remaining} remaining of {item.maximum} · {gbp(item.totalDiscountPence)} discounts given</p>
     <p>{item.startsAt?'From '+new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short',hourCycle:'h23',timeZone:'Europe/London'}).format(new Date(item.startsAt)):'No start date'} · {item.expiresAt?'Ends '+new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'short',hourCycle:'h23',timeZone:'Europe/London'}).format(new Date(item.expiresAt)):'No expiry date'}</p>
    </div><button type="button" className="button outline" onClick={()=>open(item)}>Edit settings</button>
   </article>)}
   {loaded&&!rows.length&&<p role="status">No codes configured. Select Add discount code.</p>}
  </>}
  {editing&&<div className="hub-fields">
   <h4>{editing.id?editing.code?'Edit '+editing.code:'Configure Early Bird placeholder':'Add discount code'}</h4>
   <label>Discount name<input value={editing.name} required maxLength={120} onChange={e=>update({name:e.target.value})}/></label>
   <label>Discount code<input value={editing.code||''} maxLength={32} disabled={editing.used>0||editing.reserved>0} placeholder="e.g. EARLYBIRD2027" onChange={e=>update({code:e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'')})}/><small>Unique within this form; not case-sensitive when entered by customers.</small></label>
   <div className="hub-two">
    <label>Discount type<select disabled={editing.used>0||editing.reserved>0} value={editing.basis} onChange={e=>update({basis:e.target.value as Entry['basis'],value:0})}><option value="fixed">Fixed amount (£)</option><option value="percentage">Percentage (%)</option></select></label>
    <label>{editing.basis==='fixed'?'Discount value (£)':'Discount value (%)'}<input type="number" min={editing.active?0.01:0} max={editing.basis==='percentage'?100:10000} step={editing.basis==='fixed'?'0.01':'1'} disabled={editing.used>0||editing.reserved>0} value={editing.basis==='fixed'?editing.value/100:editing.value} onChange={e=>update({value:editing.basis==='fixed'?Math.round(Number(e.target.value)*100):Math.floor(Number(e.target.value))})}/></label>
   </div>
   <div className="hub-two">
    <label>Ticket categories<select value={editing.categories} disabled={editing.used>0||editing.reserved>0} onChange={e=>update({categories:e.target.value as Entry['categories']})}><option value="all">All paid admissions</option><option value="adult">Adults only</option><option value="child">Children only</option></select></label>
    <label>Apply discount<select value={editing.application} disabled={editing.used>0||editing.reserved>0} onChange={e=>update({application:e.target.value as Entry['application']})}><option value="per_booking">Once per booking</option><option value="per_ticket">Per eligible ticket</option></select></label>
   </div>
   <div className="hub-two">
    <label>Maximum successful uses<input type="number" min={editing.used+editing.reserved||0} max={1000000} step={1} value={editing.maximum} onChange={e=>update({maximum:Math.floor(Number(e.target.value))})}/></label>
    <label>Count uses by<select value={editing.redemptionBasis} disabled={editing.used>0||editing.reserved>0} onChange={e=>update({redemptionBasis:e.target.value as Entry['redemptionBasis']})}><option value="booking">Booking (default)</option><option value="ticket">Eligible ticket quantity</option></select></label>
   </div>
   <label>Optional maximum uses per customer<input type="number" min={1} max={1000000} placeholder="Unlimited" value={editing.perCustomerMaximum??''} onChange={e=>update({perCustomerMaximum:e.target.value?Math.floor(Number(e.target.value)):null})}/></label>
   <div className="hub-two">
    <label>Start (UK time, optional)<input type="datetime-local" lang="en-GB" value={start} onChange={e=>setStart(e.target.value)}/></label>
    <label>Expiry (UK time, optional)<input type="datetime-local" lang="en-GB" value={end} onChange={e=>setEnd(e.target.value)}/></label>
   </div>
   <p className="form-context">All times are UK local time (GMT/BST), displayed as DD/MM/YYYY and HH:mm.</p>
   <label>Who can use this discount?<select value={editing.paidMembersOnly?'paid':'all'} disabled={editing.used>0||editing.reserved>0} onChange={e=>update({paidMembersOnly:e.target.value==='paid'})}><option value="all">All customers</option><option value="paid">Paid ICSH members only</option></select></label>
   <label className="hub-checkbox"><input type="checkbox" checked={editing.active} onChange={e=>update({active:e.target.checked})}/>Activate this discount code</label>
   <p><strong>Redemptions used:</strong> {editing.used} · <strong>Held in checkout:</strong> {editing.reserved} · <strong>Total given:</strong> {gbp(editing.totalDiscountPence)}</p>
   <div className="actions"><button type="button" className="button" disabled={busy} onClick={()=>void save()}>{busy?'Saving…':'Save Settings'}</button><button type="button" className="button outline" onClick={()=>setEditing(null)}>Cancel</button></div>
  </div>}
  <p role="status" aria-live="polite">{message}</p>
 </section>;
}
