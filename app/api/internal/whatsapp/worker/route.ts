import type {NextRequest} from 'next/server';
import {readOfferBody,offerJson,offerError} from '@/lib/offers/security';
import {authenticateWorker} from '@/lib/whatsapp/worker-auth';
import {workerHeartbeat,workerId,processWorkerDryRun} from '@/lib/whatsapp/bridge';
import {planAutomaticOffer} from '@/lib/whatsapp/planner';
import {nextRealTask,finishTask,authorizeHandoff} from '@/lib/whatsapp/dispatch';
import {AppError} from '@/lib/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function POST(request:NextRequest){try{const body=await readOfferBody(request,96000);await authenticateWorker(request,body);if(body.action==='heartbeat')return offerJson(await workerHeartbeat(body));if(body.action==='poll'&&Object.keys(body).every(k=>['action','worker_id'].includes(k))){const id=workerId(body.worker_id);if(process.env.WHATSAPP_SEND_ENABLED==='true'){await planAutomaticOffer();return offerJson({task:await nextRealTask(id)});}return offerJson(await processWorkerDryRun(id));}if(body.action==='handoff')return offerJson(await authorizeHandoff(workerId(body.worker_id),body));if(body.action==='result')return offerJson(await finishTask(workerId(body.worker_id),body));throw new AppError('REQUEST_INVALID');}catch(e){return offerError(e);}}
