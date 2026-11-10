'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {retryMembershipActivation} from './actions';
export default function RetryMembershipActivation({id}:{id:string}){const router=useRouter(),lock=useRef(false);const[busy,setBusy]=useState(false),[message,setMessage]=useState('');async function retry(){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{const result=await retryMembershipActivation(id);setMessage(result.message);router.refresh();}catch{setMessage('Activation could not be checked. Please retry later.');}finally{lock.current=false;setBusy(false);}}return <div><button className="button outline" type="button" disabled={busy} onClick={retry}>{busy?'Checking activation…':'Retry membership activation'}</button>{message&&<p role="status">{message}</p>}</div>;}
