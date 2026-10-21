import {PageHero,Arrow} from '@/components/Shared';
import Link from 'next/link';
import MembershipForm from '@/components/MembershipForm';
import {MEMBERSHIP_RATES,londonDate,priceLabel} from '@/lib/membership';
import {MEMBERSHIP_PRICING} from '@/lib/membership-pricing';
export const dynamic='force-dynamic';
export const metadata={title:'Membership',description:'ICSH annual membership: standard £20, pensioner £15 for ages 65+, and free for under-21s in full-time education. Complete and review your form; online submissions open later.',alternates:{canonical:'/membership'}};
export default async function Membership({searchParams}:{searchParams:Promise<{category?:string}>}) {
 const {category}=await searchParams;
 return <>
  <PageHero label="A place for everyone" title={<>Your community.<br/>Your place to belong.</>} description="Join ICSH with flexible annual membership options designed to make membership accessible to more people. Everyone is welcome, whatever their background."/>
  <section className="section white membership-options" id="options"><div className="wrap"><div className="section-head"><div><div className="eyebrow">Annual membership</div><h2>A full year.<br/>More ways to belong.</h2></div><p>All memberships are valid for {MEMBERSHIP_PRICING.durationMonths} months from confirmed activation or renewal.</p></div><div className="pricing-grid">{MEMBERSHIP_RATES.map(rate=><article className={`pricing-card ${rate.id}`} key={rate.id}><span className="pricing-badge">{rate.badge}</span><h2>{rate.name}</h2><p className="pricing-eligibility">{rate.eligibility}</p><div className="pricing-amount">{priceLabel(rate.fee,false)}<small>{rate.fee===0?'for 12 months':'/ year'}</small></div><ul>{rate.benefits.map(benefit=><li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul><Link className="button" href="#join">Join Now <Arrow/></Link><span className="pricing-duration">12-month membership</span></article>)}</div><p className="quiet-note">The pensioner concession begins on your 65th birthday. Under-21s who are not in full-time education pay £20. Some events have separate charges, availability and eligibility rules.</p></div></section>
  <section className="section" id="join"><div className="wrap"><div className="section-head"><div><div className="eyebrow">Join or renew</div><h2>Your next chapter<br/>starts with community.</h2></div><p>Five clear steps, one welcoming community. We’ll calculate the right membership category and fee from your answers.</p></div><MembershipForm today={londonDate()} renewal={category==='renewal'} newMember={category==='new'}/></div></section>
  <section className="section white" id="how-it-works"><div className="wrap reading"><div className="eyebrow">A little more to know</div><h2>Membership, made clear.</h2>{[
   ['How much is ICSH membership?','Standard membership is £20 per year. Pensioner membership is £15 from age 65. Student membership is free for applicants under 21 who are in full-time education and confirm the required declaration.'],
   ['When does my membership begin?','All categories last 12 months from confirmed membership activation or renewal. The form does not calculate activation or expiry dates yet; those will be confirmed when online registration opens. Calendar-year expiry does not apply.'],
   ['Can I edit my answers?','Yes. Use Back or the edit buttons on the review screen. Your answers remain available in the open form. Changes to date of birth or education reset the student declaration, and editing information resets the final accuracy declaration.'],
   ['Does Complete Form submit an application?','No. It completes the on-screen form only. Online submissions and payments are not yet available, and no application, membership number, receipt or confirmation email is created.'],
   ['Can someone under 18 use the form?','Applicants under 18 can complete and review the form on screen. Before live registration opens, ICSH must review and approve its parent or guardian consent and safeguarding process.'],
   ['What happens to my information?','Your answers stay in temporary memory while the form is open. They are not transmitted to any submission system or stored in a database, browser storage, cookies or analytics. Leaving or reloading the form clears the session.'],
   ['Does renewal mean an automatic payment?','No. Rolling membership describes the period of validity; it does not authorise recurring payments.'],
  ].map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
 </>
}
