import { it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
const require = createRequire(import.meta.url);
const { runSecurityCheck } = require('../scripts/security-check.mjs') as { runSecurityCheck:(root:string)=>number };
it('scanner rejeita segredo staged mesmo com arquivo de trabalho limpo, e rejeita env rastreado',()=>{
  const scratch=resolve(process.cwd(),'work');mkdirSync(scratch,{recursive:true});const dir=mkdtempSync(resolve(scratch,'scanner-'));
  if(!dir.startsWith(scratch+sep))throw new Error('Diretório de teste inválido');
  const output=vi.spyOn(console,'error').mockImplementation(()=>undefined);const log=vi.spyOn(console,'log').mockImplementation(()=>undefined);
  try {
    execFileSync('git',['init','-q'],{cwd:dir});
    const variable=['MELI','CLIENT','SECRET'].join('_');
    writeFileSync(resolve(dir,'config.ts'),`${variable}="live-${'credential'.repeat(3)}"`);
    execFileSync('git',['add','config.ts'],{cwd:dir});writeFileSync(resolve(dir,'config.ts'),'// clean working file');
    expect(runSecurityCheck(dir)).toBe(1);expect(output.mock.calls.some(call=>String(call[0]).includes('staged'))).toBe(true);
    execFileSync('git',['add','config.ts'],{cwd:dir});writeFileSync(resolve(dir,'.env.local'),'');execFileSync('git',['add','.env.local'],{cwd:dir});
    expect(runSecurityCheck(dir)).toBe(1);expect(output.mock.calls.some(call=>String(call[0]).includes('ambiente rastreado'))).toBe(true);
  } finally {
    output.mockRestore();log.mockRestore();
    rmSync(dir,{recursive:true,force:true});
  }
},30000);
