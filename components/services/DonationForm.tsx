'use client';
import {useState} from 'react';
import styles from './services.module.css';
export default function DonationForm(){
 const [amount,setAmount]=useState(''),[review,setReview]=useState(false);
 const numeric=Number(amount),valid=/^\d+(\.\d{1,2})?$/.test(amount)&&numeric>0&&numeric<=100000;
 return <form className={styles.panel} onSubmit={e=>{e.preventDefault();if(valid)setReview(true);}}>
  <div className="eyebrow">A little can go a long way</div><h2>Your donation</h2><p className={styles.help}>Online payments are coming soon. You can explore the form below; your details will not be sent or saved.</p>
  <div className={styles.donationAmounts} aria-label="Suggested donation amounts">{[10,20,50,100].map(n=><button key={n} type="button" aria-pressed={amount===String(n)} onClick={()=>{setAmount(String(n));setReview(false);}}>£{n}</button>)}</div>
  <div className={styles.fields}><div className={`${styles.field} ${styles.wide}`}><label htmlFor="donation-amount">How much would you like to donate?</label><input id="donation-amount" name="amount" inputMode="decimal" type="number" min="0.01" max="100000" step="0.01" placeholder="Enter an amount in £" value={amount} onChange={e=>{setAmount(e.target.value);setReview(false);}} required aria-describedby="donation-amount-help"/><p className={styles.help} id="donation-amount-help">Amount in pounds sterling (GBP).</p></div>
  <div className={styles.field}><label htmlFor="donation-first">First name <span className={styles.optional}>Optional</span></label><input id="donation-first" name="firstName" autoComplete="given-name" maxLength={255}/></div><div className={styles.field}><label htmlFor="donation-last">Last name <span className={styles.optional}>Optional</span></label><input id="donation-last" name="lastName" autoComplete="family-name" maxLength={255}/></div><div className={`${styles.field} ${styles.wide}`}><label htmlFor="donation-email">Email <span className={styles.optional}>Optional</span></label><input id="donation-email" name="email" autoComplete="email" type="email" maxLength={254}/></div></div>
  <div className={styles.paymentPlaceholder} aria-live="polite"><span className="tag">Payment coming soon</span><h3 style={{marginTop:18}}>Payment for donation</h3>{valid&&<div className={styles.amount}>£{numeric.toFixed(2)}</div>}<p>Secure card payments will be available here once they are ready. No card details can be entered and no payment will be taken.</p>{review&&<p><strong>This form is a preview.</strong> Your donation has not been submitted. Your details have not been saved.</p>}<button className="button" type="button" disabled>Online payment unavailable</button></div>
  <div className={styles.actions}><button className="button outline" type="submit">Preview donation amount</button></div>
 </form>;
}
