import 'server-only';
import {cache} from 'react';
import {cookies} from 'next/headers';
import {administratorSession} from '../affiliates/admin';
import {digest} from '../crypto';
export const adminPageContext=cache(async()=>{
 const jar=await cookies();const value=jar.get('__Host-croco_session')?.value??(process.env.NODE_ENV!=='production'?jar.get('croco_session')?.value:undefined);
 try{if(value&&await administratorSession(value))return {authorized:true as const,owner:digest(value)};}catch{return {authorized:false as const,unavailable:true};}
 return {authorized:false as const,unavailable:false};
});
