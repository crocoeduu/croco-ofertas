import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,rename,mkdir,unlink,access,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
export class EncryptedStore {
 constructor(directory,key,context){if(!/^[a-f0-9]{64}$/i.test(key??''))throw Error('SESSION_KEY_INVALID');this.directory=directory;this.key=Buffer.from(key,'hex');this.context=context;}
 path(session){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(session))throw Error('SESSION_INVALID');return resolve(this.directory,createHash('sha256').update(this.context+session).digest('hex')+'.enc');}
 async sessionExists({session}){try{await access(this.path(session));return true;}catch(error){if(error.code==='ENOENT')return false;throw Error('SESSION_STORAGE_UNAVAILABLE',{cause:error});}}
 async save({session}){const input=await readFile(resolve(session+'.zip'));const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(this.context+session));const encrypted=Buffer.concat([cipher.update(input),cipher.final()]);await mkdir(this.directory,{recursive:true,mode:0o700});const path=this.path(session);await writeFile(path+'.tmp',Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{mode:0o600});await rename(path+'.tmp',path);}
 async extract({session,path}){const data=await readFile(this.path(session));const decipher=createDecipheriv('aes-256-gcm',this.key,data.subarray(0,12));decipher.setAAD(Buffer.from(this.context+session));decipher.setAuthTag(data.subarray(12,28));await writeFile(path,Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]),{mode:0o600});}
 async delete({session}){await unlink(this.path(session)).catch(e=>{if(e.code!=='ENOENT')throw Error('SESSION_DELETE_FAILED');});}
}

// The configured volume is dedicated to one Croco worker/account. Keep the receipt journal.
export async function clearEncryptedSessions(directory){
 for(const entry of await readdir(directory))if(/^[a-f0-9]{64}\.enc(?:\.tmp)?$/.test(entry))await unlink(resolve(directory,entry));
}
