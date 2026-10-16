import {notFound} from 'next/navigation';
import Link from 'next/link';
import Gallery from '@/components/Gallery';
import {PageHero,Arrow} from '@/components/Shared';
import {site} from '@/lib/content';
import albums from '@/content/galleries.json';
export function generateStaticParams(){return albums.map(a=>({slug:a.slug}))}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const a=albums.find(a=>a.slug===slug);return a?{title:a.title+' — Photo Gallery',description:a.description,alternates:{canonical:'/gallery/'+slug}}:{}}
export default async function Album({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const a=albums.find(a=>a.slug===slug);if(!a)notFound();return <><PageHero label={`${a.date} · ${a.photos.length} photographs`} title={a.title} description={a.description}/><section className="section white"><div className="wrap"><div className="section-head"><Link className="text-link" href="/gallery">← All albums</Link><Link className="text-link" href="/blog/norwegian-fjords-cruise-2026">Read the story <Arrow/></Link></div><Gallery photos={a.photos}/><div className="notice"><strong>Your memories, treated with care</strong>To request a photograph’s replacement or removal, email <a href={'mailto:'+site.email+'?subject=Website%20photo%20request'}>{site.email}</a> with the album name and photo number.</div></div></section></>}
