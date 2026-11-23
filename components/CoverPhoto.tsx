'use client';

import Image from 'next/image';
import {useState} from 'react';

export default function CoverPhoto({
 src, alt, priority = false, dimensions,
}: {
 src?: string;
 alt: string;
 priority?: boolean;
 dimensions?: {width:number; height:number};
}) {
 const [failedSource, setFailedSource] = useState<string>();
 if (!src || src === failedSource) {
  return <div className="cover-photo-placeholder" aria-hidden="true"><span>ICSH</span></div>;
 }

 const {width,height}=dimensions??{width:1200,height:900};

 return <Image
  src={src}
  alt={alt}
  width={width}
  height={height}
  style={height>width?{objectPosition:'50% 63%'}:undefined}
  sizes="(max-width:650px) 100vw, (max-width:1000px) 50vw, 600px"
  priority={priority}
  unoptimized={src.startsWith('/api/events-image/')}
  onError={() => setFailedSource(src)}
 />;
}
