import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {AppError} from '@/lib/errors';
const mocked=vi.hoisted(()=>({admin:vi.fn(),data:vi.fn(),watch:vi.fn(),settings:vi.fn(),job:vi.fn(),queue:vi.fn()}));
vi.mock('@/lib/affiliates/admin',()=>({requireAdministrator:mocked.admin,administratorId:()=>null}));
vi.mock('@/lib/operations/dashboard',()=>({workspaceData:mocked.data}));
vi.mock('@/lib/operations/watchlist',()=>({saveWatch:mocked.watch,markRead:vi.fn()}));
vi.mock('@/lib/operations/repository',()=>({saveSettings:mocked.settings,getSettings:vi.fn()}));
vi.mock('@/lib/operations/jobs',()=>({runCollection:mocked.job}));
vi.mock('@/lib/distribution/queue',()=>({enqueue:mocked.queue,cancelQueue:mocked.queue,simulateQueue:mocked.queue}));
import {GET,POST} from '@/app/api/admin/workspace/route';
import {GET as cron} from '@/app/api/jobs/collection/route';
beforeEach(()=>vi.resetAllMocks());
it('todas as operações exigem autorização administrativa antes de qualquer mutação',async()=>{
 mocked.admin.mockRejectedValue(new AppError('ADMIN_REQUIRED'));
 for(const action of ['watch','settings','pause','notification','campaign','approve','prepare','collect','enqueue','cancel','simulate']){const r=await POST(new NextRequest('https://example.com/api/admin/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}));expect(r.status).toBe(403);}
 expect(mocked.watch).not.toHaveBeenCalled();expect(mocked.settings).not.toHaveBeenCalled();expect(mocked.job).not.toHaveBeenCalled();expect(mocked.queue).not.toHaveBeenCalled();
});
it('leitura exige papel e bloqueia parâmetros arbitrários',async()=>{mocked.admin.mockRejectedValueOnce(new AppError('CONNECTION_MISSING'));expect((await GET(new NextRequest('https://example.com/api/admin/workspace'))).status).toBe(401);mocked.admin.mockResolvedValue('a'.repeat(64));expect((await GET(new NextRequest('https://example.com/api/admin/workspace?section=queue&url=https://evil.test'))).status).toBe(400);expect(mocked.data).not.toHaveBeenCalled();});
it('mutações delegam a validação e recebem owner do servidor',async()=>{mocked.admin.mockResolvedValue('a'.repeat(64));mocked.watch.mockResolvedValue({id:'example'});const r=await POST(new NextRequest('https://example.com/api/admin/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'watch',product_id:'MLB123456789'})}));expect(r.status).toBe(200);expect(mocked.watch).toHaveBeenCalledWith({product_id:'MLB123456789'});});
it('cron não aceita ausência de segredo, query ou autenticação incorreta',async()=>{vi.stubEnv('CRON_SECRET','unit-placeholder-not-a-real-credential-123456789');for(const path of ['','?url=https://evil.test']){const r=await cron(new NextRequest('https://example.com/api/jobs/collection'+path,{headers:{authorization:'Bearer wrong'}}));expect(r.status).toBe(403);}expect(mocked.job).not.toHaveBeenCalled();vi.unstubAllEnvs();});
