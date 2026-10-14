import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
// Node 24 can require synchronous ESM; keeping the scanner dependency-free.
const require = createRequire(import.meta.url);
const { scanText } = require('../scripts/security-check.mjs') as { scanText: (text: string) => unknown[] };
it('scanner detecta segredo literal sem imprimir valor',()=>{const value='unit-'+'credential-123456';const hits=scanText(['MELI','CLIENT','SECRET'].join('_')+'="'+value.replace('unit-','live-')+'"');expect(hits.length).toBeGreaterThan(0);expect(JSON.stringify(hits)).not.toContain('credential');});
it('scanner detecta token Mercado Livre',()=>expect(scanText(['APP','USR'].join('_')+'-'+'1'.repeat(24)).length).toBeGreaterThan(0));
it('scanner aceita placeholders',()=>expect(scanText('MELI_CLIENT_SECRET="SEU_CLIENT_SECRET"')).toEqual([]));
