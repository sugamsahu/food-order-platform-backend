// Drops every table, sequence, enum type and function in the public schema, then migrates and seeds.
// It drops the objects one by one instead of dropping the schema, so it also works when the schema
// itself is owned by another role. DESTRUCTIVE: local/CI use only.
// Usage: node scripts/reset-db.js [--no-seed]
require('dotenv').config()
const { execSync } = require('child_process')
const { Client } = require('pg')

const dbName = process.env.DB_NAME || 'food_order'
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset a database when NODE_ENV=production')
  process.exit(1)
}

;(async () => {
  const client = new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: dbName,
    ssl: String(process.env.DB_SSL || 'false') === 'true' ? { rejectUnauthorized: false } : undefined
  })
  await client.connect()
  await client.query(`
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
      END LOOP;
      FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.sequencename);
      END LOOP;
      FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
               WHERE n.nspname = 'public' AND t.typtype = 'e' LOOP
        EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
      END LOOP;
      FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public'
                 AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE', r.proname, r.args);
      END LOOP;
    END $$;
  `)
  await client.end()
  const opts = { stdio: 'inherit', env: process.env }
  execSync('npx sequelize-cli db:migrate', opts)
  if (!process.argv.includes('--no-seed')) execSync('npx sequelize-cli db:seed:all', opts)
  console.log(`Database "${dbName}" reset.`)
})().catch((e) => { console.error(e.message); process.exit(1) })
