'use client';
import {useRef,useState} from 'react';
export default function ExportMemberships(){
 const lock=useRef(false);const[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function download(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   const response=await fetch('/admin/memberships/export',{credentials:'same-origin',cache:'no-store'});
   if(!response.ok||!response.headers.get('content-type')?.startsWith('text/csv'))throw Error(response.status===401||response.status===403?'Please sign in again with your approved organiser account.':'The export could not be completed. Please retry.');
   const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement('a');
   anchor.href=url;anchor.download=response.headers.get('content-disposition')?.match(/filename="([a-z0-9-]+\.csv)"/)?.[1]||'icsh-membership-applications.csv';
   document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){setError(e instanceof Error?e.message:'The export could not be completed. Please retry.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <div><button type="button" className="button outline" disabled={busy} onClick={download} aria-describedby="membership-export-note">{busy?'Preparing CSV…':'Export CSV'}</button><p id="membership-export-note" className="quiet-note">All saved applications · CSV</p>{error&&<p className="notice" role="alert">{error}</p>}</div>;
}
