'use client';
import {useEffect,useRef,useId} from 'react';
import {capacityMessage} from '@/lib/events-hub/capacity';
import styles from './capacity-notice.module.css';
export default function CapacityNotice({open}:{open:boolean}){const dialog=useRef<HTMLDialogElement>(null),heading=useId();useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();},[open]);return <dialog ref={dialog} className={styles.dialog} aria-labelledby={heading}><h2 id={heading}>Maximum bookings reached</h2><p>{capacityMessage}</p><a href="mailto:events@icsh.org.uk">Contact the Events Team</a><button className="button" type="button" onClick={()=>dialog.current?.close()}>Close</button></dialog>;}
