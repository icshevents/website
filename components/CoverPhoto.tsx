'use client';

import Image from 'next/image';
import {useState} from 'react';

export default function CoverPhoto({
 src, alt, dimensions, article = false,
}: {
 src?: string;
 alt: string;
 dimensions?: {width:number; height:number};
 article?: boolean;
}) {
 const [failedSource, setFailedSource] = useState<string>();
 if (!src || src === failedSource) {
  return <div className="cover-photo-placeholder" aria-hidden="true"><span>ICSH</span></div>;
 }

 const {width, height} = dimensions ?? {width:1200, height:900};
 const portrait = height > width;

 return <Image
  src={src}
  alt={alt}
  width={width}
  height={height}
  sizes="(max-width:650px) 100vw, (max-width:1000px) 50vw, 600px"
  priority={article}
  style={portrait && article ? {width:'auto', height:'auto', maxHeight:720, marginInline:'auto'}
   : portrait ? {objectPosition:'50% 63%'} : undefined}
  unoptimized={src.startsWith('/api/events-image/')}
  onError={() => setFailedSource(src)}
 />;
}
