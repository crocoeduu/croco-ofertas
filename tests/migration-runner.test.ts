import {it,expect,vi} from 'vitest';
// @ts-expect-error The runner is plain Node JavaScript, shared with the operational CLI.
import {runMigrations} from '../scripts/migration-runner.mjs';
it('preserva instalação existente e ignora versões aplicadas, incluindo WhatsApp',async()=>{
 const query=vi.fn(async(sql:string)=>{if(sql.startsWith('SELECT to_regclass'))return {rows:[{connections:true,rate_limits:true,oauth_states:true}]};if(sql.startsWith('SELECT version'))return {rowCount:1};return {rows:[]};});
 await runMigrations({query},'NEVER_INITIAL',[{version:'20261015143843',sql:'NEVER_REAPPLY'}]);
 expect(query.mock.calls.flat()).not.toContain('NEVER_INITIAL');expect(query.mock.calls.flat()).not.toContain('NEVER_REAPPLY');
});
it('registra somente migration ausente e faz rollback se SQL falha',async()=>{
 const query=vi.fn(async(sql:string)=>{if(sql.startsWith('SELECT to_regclass'))return {rows:[{connections:true,rate_limits:true,oauth_states:true}]};if(sql.startsWith('SELECT version'))return {rowCount:0};if(sql==='FAIL')throw Error('QA_FAILURE');return {rows:[]};});
 await runMigrations({query},'INITIAL',[{version:'20261015143844',sql:'BEGIN; NEW_SQL; COMMIT;'}]);
 expect(query.mock.calls.some(c=>c[0].startsWith('INSERT INTO offers.schema_migrations'))).toBe(true);
 await expect(runMigrations({query},'INITIAL',[{version:'20261015143845',sql:'FAIL'}])).rejects.toThrow('QA_FAILURE');expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
});
it('schema parcial falha sem tentar recriar dados existentes',async()=>{
 const query=vi.fn(async(sql:string)=>sql.startsWith('SELECT to_regclass')?{rows:[{connections:true,rate_limits:false,oauth_states:false}]}:{rows:[]});
 await expect(runMigrations({query},'NEVER_INITIAL',[])).rejects.toThrow('DB_SCHEMA_PARTIAL');expect(query.mock.calls.flat()).not.toContain('NEVER_INITIAL');
});
