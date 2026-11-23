import type {MetadataRoute} from 'next';
import {launched,canonicalOrigin,membershipIndexingEnabled} from '@/lib/content';
export default function robots():MetadataRoute.Robots {
  if (launched) return {rules:{userAgent:'*',allow:'/'},sitemap:canonicalOrigin+'/sitemap.xml'};
  return {rules:[
    // Permit Meta's link/website checks while retaining the pre-launch search block.
    {userAgent:['facebookexternalhit','Facebot'],allow:'/'},
    ...(membershipIndexingEnabled ? [
      // Search Console's live test uses a separate crawler from Google Search.
      {userAgent:'Google-InspectionTool',allow:'/membership',disallow:['/membership/','/admin','/api/']},
      {userAgent:'*',allow:'/membership',disallow:['/','/membership/']},
    ] : [{userAgent:'*',disallow:'/'}]),
  ]};
}
