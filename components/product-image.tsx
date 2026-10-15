'use client';
import {useState} from 'react';
import {productImageUrl} from '@/lib/offers/media';
export function ProductImage({src,title}:{src?:string;title:string}) {
  const [failed,setFailed]=useState<string|null>(null);const url=productImageUrl(src);const show=!!url&&failed!==url;
  return <div className="product-image media-frame" aria-label={`Imagem de ${title}`}>
    {show?<img src={url} alt={title} loading="lazy" decoding="async" width="240" height="180" onError={()=>setFailed(url)}/>:<span className="image-fallback"><span aria-hidden="true">▧</span><span>Imagem indisponível</span></span>}
  </div>;
}
