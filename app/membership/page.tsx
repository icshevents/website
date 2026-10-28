import {Arrow} from '@/components/Shared';
import Link from 'next/link';
import MembershipForm from '@/components/MembershipForm';
import {MEMBERSHIP_RATES,londonDate,priceLabel} from '@/lib/membership';
import {MEMBERSHIP_PRICING} from '@/lib/membership-pricing';
import {paymentConfiguration} from '@/lib/membership-payments/server';
export const dynamic='force-dynamic';
export const metadata={title:'Membership',description:'ICSH annual membership: standard £20, pensioner £15 for ages 65+, and free for full-time students aged 17–21 and for minors aged 16 and below. Apply to join or renew.',alternates:{canonical:'/membership'}};
export default async function Membership({searchParams}:{searchParams:Promise<{category?:string}>}) {
 const {category}=await searchParams;
 return <>
  <section className="section white membership-options" id="options"><div className="wrap"><div className="section-head"><div><h1 style={{fontSize:'clamp(34px,3.4vw,48px)',margin:0}}>A full year.<br/>More ways to belong.</h1></div><p>Membership normally lasts {MEMBERSHIP_PRICING.durationMonths} months: paid membership starts from confirmed fee payment, and free membership from confirmed activation.</p></div><div className="pricing-grid">{MEMBERSHIP_RATES.map(rate=><article className={`pricing-card ${rate.id}`} key={rate.id}><span className="pricing-badge">{rate.badge}</span><h2>{rate.name}</h2><p className="pricing-eligibility">{rate.eligibility}</p><div className="pricing-amount">{priceLabel(rate.fee,false)}<small>{rate.fee===0?'for 12 months':'/ year'}</small></div><ul>{rate.benefits.map(benefit=><li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul><Link className="button" href="#join">Join Now <Arrow/></Link></article>)}</div><p className="quiet-note">Applicants must be aged 17 or above. Children aged 16 and below are dependants of a member and do not need their own form. Some events have separate fees and eligibility rules.</p></div></section>
  <section className="section" id="join"><div className="wrap"><div className="section-head"><h2>Become a Member</h2></div><MembershipForm today={londonDate()} renewal={category==='renewal'} newMember={category==='new'} paymentsEnabled={Boolean(paymentConfiguration())}/></div></section>
  <section className="section white" id="how-it-works"><div className="wrap reading"><h2>Membership questions</h2>{[
   ['What if I am already a member?','Choose Membership Renewal and use your existing details. A current membership blocks a duplicate application. Contact ICSH if your details need correcting.'],
   ['When does membership begin?','Paid membership activates after verified payment and lasts 12 months from the UK payment date. Free membership begins after confirmation from ICSH.'],
   ['What if I paid in December 2025?','Membership paid in December 2025 expires on 31 December 2026, regardless of the December payment date, to honour the full 2026 membership promised. Memberships paid from January 2026 onwards follow the rolling 12-month validity.'],
   ['Can I edit my answers?','Use Back or Edit before submitting. To correct a saved application, contact ICSH with its reference.'],
   ['How is my information used?','Your details are checked against membership records and saved privately to manage your application. See our privacy information for details.'],
   ['Will membership renew automatically?','No. Each payment is for a single 12-month term.'],
  ].map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
 </>
}
