import type {MetadataRoute} from 'next';
import {posts,canonicalOrigin} from '@/lib/content';
export default function sitemap():MetadataRoute.Sitemap{return ['','/about','/membership','/events','/blog','/rishta-service','/participate','/donate','/contact','/privacy',...posts().map(p=>'/blog/'+p.slug)].map(p=>({url:canonicalOrigin+p,changeFrequency:'monthly',priority:p===''?1:.7}))}
