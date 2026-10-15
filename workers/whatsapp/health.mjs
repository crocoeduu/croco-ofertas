import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function recordHealth(directory,status,now=Date.now()){
 const path=resolve(directory,'health.json');
 await writeFile(path+'.tmp',JSON.stringify({lastSeenAt:now,status}),{mode:0o600});
 await rename(path+'.tmp',path);
}
export async function healthy(directory,now=Date.now()){
 try{const h=JSON.parse(await readFile(resolve(directory,'health.json'),'utf8'));return Number.isFinite(h.lastSeenAt)&&now-h.lastSeenAt>=0&&now-h.lastSeenAt<90000&&!['failed','stopped'].includes(h.status);}catch{return false;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const ok=await healthy(process.env.WHATSAPP_STATE_DIRECTORY??'/var/lib/croco');
 console.log(ok?'WORKER_HEALTH_OK':'WORKER_HEALTH_FAILED');process.exitCode=ok?0:1;
}
