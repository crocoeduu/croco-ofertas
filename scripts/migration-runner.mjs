// Dependency injection lets CI verify journal/rollback behavior without a production database.
export async function runMigrations(client,initial,migrations){
 await client.query('BEGIN');
 try{
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('croco:schema_migrations',0))");
  const {rows:[base]}=await client.query("SELECT to_regclass('public.meli_connections') IS NOT NULL AS connections,to_regclass('public.rate_limit_buckets') IS NOT NULL AS rate_limits,to_regclass('public.used_oauth_states') IS NOT NULL AS oauth_states");
  const present=[base.connections,base.rate_limits,base.oauth_states].filter(Boolean).length;
  if(present!==0&&present!==3)throw Error('DB_SCHEMA_PARTIAL');
  if(present===0)await client.query(unwrap(initial));
  await client.query('CREATE SCHEMA IF NOT EXISTS offers');
  await client.query('CREATE TABLE IF NOT EXISTS offers.schema_migrations(version TEXT PRIMARY KEY,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await client.query('ALTER TABLE offers.schema_migrations ENABLE ROW LEVEL SECURITY');
  await client.query('REVOKE ALL ON offers.schema_migrations FROM PUBLIC,anon,authenticated');
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
 for(const {version,sql} of migrations){
  if(!/^\d{14}$/.test(version))throw Error('MIGRATION_VERSION_INVALID');
  await client.query('BEGIN');
  try{
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended('croco:schema_migrations',0))");
   const applied=await client.query('SELECT version FROM offers.schema_migrations WHERE version=$1',[version]);
   if(!applied.rowCount){await client.query(unwrap(sql));await client.query('INSERT INTO offers.schema_migrations(version) VALUES($1)',[version]);}
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
 }
}
function unwrap(sql){return sql.replace(/^\s*BEGIN;\s*/i,'').replace(/COMMIT;\s*$/i,'');}
