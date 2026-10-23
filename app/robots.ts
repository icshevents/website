import type {MetadataRoute} from 'next';
import {launched,canonicalOrigin} from '@/lib/content';
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:'*',...(launched?{allow:'/'}:{disallow:'/'})},...(launched?{sitemap:canonicalOrigin+'/sitemap.xml'}:{})}}
