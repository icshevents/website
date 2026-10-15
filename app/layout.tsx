import type {Metadata} from 'next';
import Header from '@/components/Header';
import MembershipInvitation from '@/components/MembershipInvitation';
import Footer from '@/components/Footer';
import {site, canonicalOrigin, launched} from '@/lib/content';
import './globals.css';
export const metadata: Metadata = {metadataBase:new URL(canonicalOrigin),title:{default:site.name,template:'%s | ICSH'},description:'Community. Friendship. A Sense of Belonging. Discover ICSH, Society of Harrow, established in 1976. Everyone is welcome to explore our activities, events and rolling annual membership.',robots:launched?{index:true,follow:true}:{index:false,follow:false},openGraph:{siteName:site.name,locale:'en_GB',type:'website',images:[{url:'/opengraph-image',width:1200,height:630}]},twitter:{card:'summary_large_image'},icons:{icon:'/assets/icsh-logo.webp'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en-GB"><body><a className="skip" href="#main">Skip to content</a><Header/><main id="main" tabIndex={-1}>{children}</main><Footer/><MembershipInvitation months={site.membership.durationMonths}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'NGO',name:site.name,alternateName:'ICSH',url:canonicalOrigin,email:site.email,foundingDate:String(site.founded),identifier:site.charityNumber,areaServed:'Harrow, London',sameAs:Object.values(site.socials)})}}/></body></html>}
