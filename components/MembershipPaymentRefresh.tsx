'use client';
import {useEffect,useRef,useTransition} from 'react';
import {useRouter} from 'next/navigation';
/** A short, bounded refresh period while Stripe or membership activation is pending. */
export default function MembershipPaymentRefresh(){
 const router=useRouter(),checks=useRef(0);const[pending,startTransition]=useTransition();
 useEffect(()=>{if(pending||checks.current>=3)return;const timer=setTimeout(()=>{checks.current++;startTransition(()=>router.refresh());},10000);return()=>clearTimeout(timer);},[router,pending]);
 return null;
}
