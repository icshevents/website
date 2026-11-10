'use client';
import {Fragment,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {deleteMembershipEntries} from './actions';
import styles from './memberships.module.css';

type Entry={id:string;reference:string;member:ReactNode;contact:ReactNode;application:ReactNode;payment:ReactNode;membership:ReactNode;received:ReactNode;content:ReactNode};

export default function MembershipEntries({entries}:{entries:Entry[]}){
 const [selected,setSelected]=useState<string[]>([]),[expanded,setExpanded]=useState<string[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const router=useRouter();
 const selectedIds=selected.filter(id=>entries.some(entry=>entry.id===id));
 async function remove(ids:string[]){
  if(busy||!ids.length)return;
  const label=ids.length===1?entries.find(x=>x.id===ids[0])?.reference:ids.length+' selected entries';
  if(!window.confirm('Delete '+label+' from the organiser list? Linked payment records are retained. This does not refund payments or delete Bigin contacts.'))return;
  setBusy(true);setMessage('');
  try{const result=await deleteMembershipEntries(ids);if(!result.ok)throw new Error(result.error);setSelected([]);setMessage((result.count??0)+' entries deleted.');router.refresh();}
  catch(e){setMessage(e instanceof Error?e.message:'Deletion failed. Please retry.');}
  finally{setBusy(false);}
 }
 return <div>
  <div className={`organiser-toolbar ${styles.tableToolbar}`}>
   <label><input type="checkbox" disabled={busy} checked={selectedIds.length===entries.length&&entries.length>0} ref={node=>{if(node)node.indeterminate=selectedIds.length>0&&selectedIds.length<entries.length;}} onChange={e=>setSelected(e.target.checked?entries.map(x=>x.id):[])}/> Select all applications</label>
   <button type="button" className="button outline" disabled={busy||!selectedIds.length} onClick={()=>remove(selectedIds)}>{busy?'Deleting…':'Delete selected ('+selectedIds.length+')'}</button>
  </div>
  <p className="quiet-note">Deleting removes entries from this list. Linked Stripe payment records are retained for reconciliation; Bigin contacts are unchanged.</p>
  {message&&<p role="status" className="notice">{message}</p>}
  <p className={styles.tableHint} id="membership-table-hint">Newest applications first. Select Review to see full answers and organiser actions. On smaller screens, scroll across the table.</p>
  <div className={styles.tableScroll} role="region" aria-label="Membership applications table" aria-describedby="membership-table-hint" tabIndex={0}>
   <table className={styles.table}>
    <caption className={styles.caption}>Saved membership applications</caption>
    <thead><tr><th scope="col"><span className={styles.visuallyHidden}>Select application</span></th><th scope="col">Member</th><th scope="col">Contact details</th><th scope="col">Application & fee</th><th scope="col">Payment</th><th scope="col">Membership</th><th scope="col">Received (UK)</th><th scope="col">Actions</th></tr></thead>
    <tbody>{entries.map(entry=>{
     const open=expanded.includes(entry.id),detailsId=`application-details-${entry.id}`;
     return <Fragment key={entry.id}>
      <tr className={selectedIds.includes(entry.id)?styles.selectedRow:undefined}>
       <td className={styles.selection}><input type="checkbox" aria-label={`Select ${entry.reference}`} disabled={busy} checked={selectedIds.includes(entry.id)} onChange={e=>setSelected(current=>e.target.checked?[...current,entry.id]:current.filter(id=>id!==entry.id))}/></td>
       <th scope="row">{entry.member}</th><td>{entry.contact}</td><td>{entry.application}</td><td>{entry.payment}</td><td>{entry.membership}</td><td>{entry.received}</td>
       <td><div className={styles.rowActions}><button type="button" className={`button outline ${styles.compactButton}`} aria-label={`${open?'Close':'Review'} ${entry.reference}`} aria-expanded={open} aria-controls={detailsId} onClick={()=>setExpanded(current=>open?current.filter(id=>id!==entry.id):[...current,entry.id])}>{open?'Close':'Review'}</button><button type="button" className={styles.deleteButton} disabled={busy} aria-label={`Delete ${entry.reference}`} onClick={()=>remove([entry.id])}>Delete</button></div></td>
      </tr>
      <tr id={detailsId} hidden={!open} className={styles.detailsRow}><td colSpan={8}>{open?entry.content:null}</td></tr>
     </Fragment>;
    })}</tbody>
   </table>
  </div>
 </div>;
}
