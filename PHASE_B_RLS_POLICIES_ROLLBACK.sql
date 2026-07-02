-- PHASE_B_RLS_POLICIES_ROLLBACK.sql
-- Removes all Phase B policies. Safe to re-run.

BEGIN;

DO $$
DECLARE
  r RECORD;
  v_policies TEXT[] := ARRAY[
    'p1_lookup_read',
    'p2_pro_own',
    'p2_user_own',
    'p3_system_internal'
  ];
  v_tables TEXT[];
BEGIN
  -- Collect all tables in scope
  SELECT ARRAY_AGG(DISTINCT tablename) INTO v_tables
  FROM pg_policies
  WHERE schemaname = 'public'
    AND policyname = ANY(v_policies);

  IF v_tables IS NOT NULL THEN
    FOREACH r IN ARRAY v_policies LOOP
      -- Drop by policy name across all tables that have it
      EXECUTE (
        SELECT STRING_AGG(
          format('DROP POLICY IF EXISTS %I ON public."%I";', r, tablename),
          ' '
        )
        FROM pg_policies
        WHERE schemaname = 'public' AND policyname = r
      );
    END LOOP;
  END IF;

  RAISE NOTICE 'Phase B policies removed.';
END
$$;

COMMIT;
