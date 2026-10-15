import type {Metadata} from 'next';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {site, canonicalOrigin, launched} from '@/lib/content';
import './globals.css';
export const metadata: Metadata = {metadataBase:new URL(canonicalOrigin),title:{default:site.name,template:'%s | ICSH'},description:'Faith. Friendship. A Sense of Belonging. Discover the Islamic & Cultural Society of Harrow, our community activities, events and rolling annual membership.',robots:launched?{index:true,follow:true}:{index:false,follow:false},openGraph:{siteName:site.name,locale:'en_GB',type:'website',images:[{url:'/opengraph-image',width:1200,height:630}]},twitter:{card:'summary_large_image'},icons:{icon:'/assets/source-0.webp'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en-GB"><body><a className="skip" href="#main">Skip to content</a><Header/><main id="main" tabIndex={-1}>{children}</main><Footer/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'NGO',name:site.name,alternateName:'ICSH',url:canonicalOrigin,email:site.email,foundingDate:String(site.founded),identifier:site.charityNumber,areaServed:'Harrow, London',sameAs:Object.values(site.socials)})}}/></body></html>}
