import {notFound} from 'next/navigation';
import Hub from '@/components/events-hub/Hub';
export default function DesignPreview(){if(process.env.NODE_ENV==='production')notFound();return <Hub demo/>;}
