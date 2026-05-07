-- PHASE_A_BASELINE_RLS_POLICIES.sql
--
-- Safe Phase A baseline for RLS policy rollout.
--
-- Goals:
-- 1) Ensure RLS is enabled on all public tables.
-- 2) Add a platform access policy for service_role (if role exists).
-- 3) Add only low-risk public read policies for lookup/reference tables.
-- 4) Provide a verification report of tables still needing nuanced app policies.
--
-- Notes:
-- - This script is intentionally conservative and does NOT attempt ownership logic
--   for business tables (projects, milestones, chat, escrow, etc.) yet.
-- - Those should be added in Phase B with explicit, tested access rules.

BEGIN;

DO $$
DECLARE
  r RECORD;
  v_service_role_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'service_role'
  ) INTO v_service_role_exists;

  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY;', r.schemaname, r.tablename);

    IF v_service_role_exists THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = r.schemaname
          AND p.tablename = r.tablename
          AND p.policyname = 'p0_service_role_all'
      ) THEN
        EXECUTE format(
          'CREATE POLICY p0_service_role_all ON %I.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
          r.schemaname,
          r.tablename
        );
      END IF;
    END IF;
  END LOOP;
END
$$;

-- Low-risk lookup table read policies (public catalog data).
-- Recreate deterministically so script is repeatable.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Tradesman') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."Tradesman";
    CREATE POLICY p1_lookup_read ON public."Tradesman"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'TradesmanTranslation') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."TradesmanTranslation";
    CREATE POLICY p1_lookup_read ON public."TradesmanTranslation"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ServiceMapping') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."ServiceMapping";
    CREATE POLICY p1_lookup_read ON public."ServiceMapping"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'MilestoneTemplate') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."MilestoneTemplate";
    CREATE POLICY p1_lookup_read ON public."MilestoneTemplate"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'RegionZone') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."RegionZone";
    CREATE POLICY p1_lookup_read ON public."RegionZone"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'RegionArea') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."RegionArea";
    CREATE POLICY p1_lookup_read ON public."RegionArea"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'RegionAreaAlias') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."RegionAreaAlias";
    CREATE POLICY p1_lookup_read ON public."RegionAreaAlias"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END
$$;

-- Verification A: per-table RLS + policy count.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  COUNT(p.*) AS policy_count,
  COUNT(*) FILTER (WHERE p.policyname = 'p0_service_role_all') AS service_role_policies,
  COUNT(*) FILTER (WHERE p.policyname <> 'p0_service_role_all') AS app_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = n.nspname
 AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

-- Verification B: tables still missing app-level policies (Phase B targets).
SELECT
  c.relname AS table_needing_phase_b
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = c.relname
      AND p.policyname <> 'p0_service_role_all'
  )
ORDER BY c.relname;

COMMIT;
