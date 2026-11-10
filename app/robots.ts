import type {MetadataRoute} from 'next';
import {launched,canonicalOrigin} from '@/lib/content';
export default function robots():MetadataRoute.Robots {
  if (launched) return {rules:{userAgent:'*',allow:'/'},sitemap:canonicalOrigin+'/sitemap.xml'};
  return {rules:[
    // Permit Meta's link/website checks while retaining the pre-launch search block.
    {userAgent:['facebookexternalhit','Facebot'],allow:'/'},
    {userAgent:'*',disallow:'/'},
  ]};
}
