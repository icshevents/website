import {websitePaymentConfiguration} from '@/lib/payments/core';
export const dynamic='force-dynamic';
import Link from 'next/link';
import DonationForm from '@/components/services/DonationForm';
import styles from '@/components/services/services.module.css';
export const metadata={title:'Donations to ICSH',description:'Support ICSH community activities and charitable work. Donate securely online through Stripe.',alternates:{canonical:'/donate'}};
export default function Donations(){return <div className="wrap"><section className={styles.intro}><Link className={styles.back} href="/events">← Events & Services</Link><div className="eyebrow" style={{marginTop:30}}>Support our community</div><h1>Donations to ICSH</h1><p>Support ICSH community activities and charitable work.</p></section><div className={styles.layout}><DonationForm available={Boolean(websitePaymentConfiguration())}/><aside className={styles.aside}><div className="eyebrow">Thank you</div><h2>Every contribution matters.</h2><p>Your donation helps bring our community together.</p><p>For donation enquiries, please contact <a href="mailto:events@icsh.org.uk">events@icsh.org.uk</a>.</p><p>Registered Charity No. 290016.</p></aside></div></div>;}
