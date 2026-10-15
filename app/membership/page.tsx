import Link from 'next/link';
import {PageHero,Arrow} from '@/components/Shared';
import MembershipForm from '@/components/MembershipForm';
import {MEMBERSHIP_RATES,londonDate} from '@/lib/membership';
import {site} from '@/lib/content';
export const dynamic='force-dynamic';
export const metadata={title:'Membership',description:'Explore proposed ICSH membership rates: standard £20, pensioner £15 for ages 66+, and free for under-21s in full-time education. Preview only; subject to approval.',alternates:{canonical:'/membership'}};
export default async function Membership({searchParams}:{searchParams:Promise<{category?:string}>}) {
 const {category}=await searchParams;
 return <>
  <PageHero label="A place for everyone" title={<>More flexible.<br/>More inclusive.</>} description="A full year of friendship, shared experiences and community. Explore our proposed membership options and find your place at ICSH."/>
  <section className="section white membership-options" id="options"><div className="wrap">
   <div className="proposal-banner"><span className="tag">Proposed Membership Rates</span><p>These categories are under consideration and have not been formally approved. They apply to this preview only. Live membership pricing and payments are unchanged.</p></div>
   <div className="pricing-grid">{MEMBERSHIP_RATES.map(rate=><article className={`pricing-card ${rate.id}`} key={rate.id}><span className="pricing-badge">{rate.badge}</span><h2>{rate.name}</h2><p className="pricing-eligibility">{rate.eligibility}</p><div className="pricing-amount">{rate.price}<small>{rate.period}</small></div><ul>{rate.benefits.map(benefit=><li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul><Link className="button" href="#join">Join Now <Arrow/></Link><span className="pricing-preview-label">Preview · subject to approval</span></article>)}</div>
   <p className="quiet-note">Everyone is welcome, whatever their background. Under-21s who are not in full-time education pay the standard £20 rate. Events may have separate charges, availability and eligibility rules.</p>
  </div></section>
  <section className="section" id="how-it-works"><div className="wrap split"><div><div className="eyebrow">One full year</div><h2>Your membership.<br/>Your twelve months.</h2><p>All proposed categories last 12 months from joining or renewal. Membership does not end automatically in January.</p><p>For example, joining on 16 October 2026 gives an expiry date of 16 October 2027. A 29 February start uses 28 February in the following non-leap year.</p></div><div className="panel"><h3>Renewing your membership?</h3><p>We recalculate eligibility at renewal, so your category can change as you become eligible for a concession or turn 21.</p><p>For early renewals, the remaining membership period will be protected. ICSH must approve the exact date calculation before early renewals are enabled. This preview marks early-renewal examples for review and leaves their expiry unchanged.</p><Link className="text-link" href="?category=renewal#join">Preview a renewal <Arrow/></Link></div></div></section>
  <section className="section white" id="join"><div className="wrap"><div className="section-head"><div><div className="eyebrow">Join or renew · preview</div><h2>Your next chapter<br/>starts with community.</h2></div><p>Enter sample details and we’ll calculate the proposed rate. No manual category or fee selection needed.</p></div><MembershipForm today={londonDate()} renewal={category==='renewal'}/></div></section>
  <section className="section"><div className="wrap reading"><div className="eyebrow">A little more to know</div><h2>Membership, made clear.</h2>{[
   ['Are the new rates approved?','Not yet. Standard £20, pensioner £15 and free student membership are proposed rates in this preview. Registration and payment activation require ICSH approval.'],
   ['Who qualifies for pensioner membership?','Members aged 66 and above. Age 65 remains standard membership unless ICSH approves a different boundary.'],
   ['Who qualifies for free membership?','Applicants must be under 21 and currently in full-time education. The full-time education declaration is mandatory, unticked by default and checked again on the server. No evidence upload is requested.'],
   ['What happens when I turn 21?','Your eligibility is recalculated at your next renewal. Full-time education alone does not qualify you for free membership once you are 21.'],
   ['Can someone under 18 register?','Not through this preview. ICSH must approve and implement the appropriate parent or guardian and safeguarding process before registration for minors can launch.'],
   ['Does this preview save my information?','The application validates the sample details for your current preview request, then discards them. It does not save records in Zoho Bigin or a member database, create a membership, take a payment or enrol you in communications.'],
   ['Does renewal mean an automatic payment?','No. Rolling membership describes the period of validity; it does not authorise recurring payments.'],
   ['How do I enquire about current membership?',`Contact ${site.email}. The existing registration service has older terms and is being reviewed; do not use the proposed rates to make a payment there.`],
  ].map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
 </>
}
