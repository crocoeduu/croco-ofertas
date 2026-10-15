// Explicit official image CDN hosts; shared by normalization and CSP, never an image proxy.
export const imageHosts=['http2.mlstatic.com','mla-s1-p.mlstatic.com','mla-s2-p.mlstatic.com','mlb-s1-p.mlstatic.com','mlb-s2-p.mlstatic.com'] as const;
export function productImageUrl(value:unknown):string|undefined {
  if(typeof value!=='string'||value.length>2048||value.trim()!==value||/[\\\s]/.test(value))return;
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||!(imageHosts as readonly string[]).includes(url.hostname)||url.username||url.password||url.port||!/^\/[A-Za-z0-9_./-]+\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname))return;url.protocol='https:';url.hash='';return url.href;}catch{return;}
}
export function firstProductImage(...values:unknown[]):string|undefined {
  for(const value of values){const candidate=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;for(const item of candidate?[candidate.secure_url,candidate.url]:[value]){const url=productImageUrl(item);if(url)return url;}}
}
