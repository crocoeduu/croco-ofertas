import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ db: { query: vi.fn() } as {query: ReturnType<typeof vi.fn>} | null }));
vi.mock('@/lib/database', () => ({ getDatabase: () => state.db }));
import { verifyDatabase } from '@/lib/database-readiness';
beforeEach(() => {
  state.db = { query: vi.fn().mockResolvedValue({rows:[],rowCount:0}) };
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());
it('executa SELECT 1 e valida as três tabelas sem ler tokens, uma vez por pool', async () => {
  await verifyDatabase();
  await verifyDatabase();
  expect(state.db!.query).toHaveBeenCalledTimes(4);
  expect(state.db!.query.mock.calls[0][0]).toBe('SELECT 1');
  expect(state.db!.query.mock.calls[1][0]).toContain('rate_limit_buckets LIMIT 1');
  expect(state.db!.query.mock.calls[2][0]).toContain('used_oauth_states LIMIT 0');
  expect(state.db!.query.mock.calls[3][0]).toContain('meli_connections LIMIT 0');
  expect(console.info).toHaveBeenCalledExactlyOnceWith('DB_READY');
});
it('autenticação rejeitada bloqueia OAuth, sanitiza o log e permite retry após correção', async () => {
  state.db!.query.mockRejectedValueOnce(Object.assign(new Error('unit-private-db-password'),{code:'28P01'}));
  await expect(verifyDatabase()).rejects.toThrow('STORAGE_ERROR');
  expect(console.error).toHaveBeenCalledExactlyOnceWith('DB_AUTH_FAILED', expect.objectContaining({sqlstate:'28P01'}));
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('unit-private-db-password');
  expect(console.info).not.toHaveBeenCalled();
  await verifyDatabase();
  expect(console.info).toHaveBeenCalledExactlyOnceWith('DB_READY');
});
it('sem persistência configurada, mantém o comportamento OAuth existente', async () => {
  state.db = null;
  await verifyDatabase();
  expect(console.info).not.toHaveBeenCalled();
});
