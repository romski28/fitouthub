-- ENABLE_RLS_ON_PUBLIC_TABLES.sql
-- Enables Row Level Security on all base tables in schema: public.
-- Use this after adding new tables so PostgREST/Supabase security checks pass.
--
-- IMPORTANT:
-- Enabling RLS is only step 1. When a new table is created, you must also add
-- explicit CREATE POLICY statements for required roles and access paths.
-- Keep policy changes in the same migration/release as the table creation.

BEGIN;

DO $$
DECLARE
  r RECORD;
  v_enabled_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', r.schemaname, r.tablename);
    v_enabled_count := v_enabled_count + 1;
  END LOOP;

  RAISE NOTICE 'RLS enabled (or already enabled) on % tables in schema public.', v_enabled_count;
END
$$;

-- Verification snapshot.
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;

COMMIT;
