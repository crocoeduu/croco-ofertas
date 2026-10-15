import {NextResponse,type NextRequest} from 'next/server';
import {requireAdministrator} from '@/lib/affiliates/admin';
import {offerError} from '@/lib/offers/security';
import {privateHeaders} from '@/lib/http';
import {adminQr} from '@/lib/whatsapp/bridge';
import {AppError} from '@/lib/errors';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(r:NextRequest){try{await requireAdministrator(r);if(r.nextUrl.search)throw new AppError('REQUEST_INVALID');return privateHeaders(new NextResponse(new Uint8Array(await adminQr()),{headers:{'Content-Type':'image/png','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}}));}catch(e){return offerError(e);}}
