-- PHASE_A2_REMAINING_ADMIN_POLICIES.sql
--
-- Applies admin policies for remaining Phase A tables discovered by verification.
-- Run after:
--   1) ENABLE_RLS_ON_PUBLIC_TABLES.sql
--   2) PHASE_A_BASELINE_RLS_POLICIES.sql
--   3) PHASE_A1_ADMIN_CRUD_POLICIES.sql
--
-- Scope decisions:
-- - Admin CRUD: operational/config tables listed below.
-- - Admin read-only: log/report-view style tables.
-- - Keep locked: EscrowCheckoutOtpChallenge (security-sensitive OTP challenge table).

BEGIN;

-- Ensure helper exists (created in A1). If missing, create it.
CREATE OR REPLACE FUNCTION public.rls_is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_claims_text text;
  v_claims jsonb := '{}'::jsonb;
  v_role text := '';
  v_app_role text := '';
BEGIN
  IF current_user = 'service_role' THEN
    RETURN true;
  END IF;

  v_claims_text := nullif(current_setting('request.jwt.claims', true), '');

  IF v_claims_text IS NOT NULL THEN
    BEGIN
      v_claims := v_claims_text::jsonb;
    EXCEPTION WHEN others THEN
      v_claims := '{}'::jsonb;
    END;
  END IF;

  v_role := lower(
    coalesce(
      v_claims->>'role',
      nullif(current_setting('request.jwt.claim.role', true), ''),
      ''
    )
  );

  v_app_role := lower(coalesce(v_claims #>> '{app_metadata,role}', ''));

  RETURN v_role IN ('admin', 'foh_admin', 'super_admin', 'supabase_admin')
      OR v_app_role IN ('admin', 'foh_admin', 'super_admin');
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  -- Admin CRUD on remaining operational/config tables.
  FOREACH t IN ARRAY ARRAY[
    'AcProject',
    'AcRoom',
    'Conversation',
    'ConversationMessage',
    'ConversationParticipant',
    'ConversationReadState',
    'PlatformFeeLoyaltyAdjustment',
    'PlatformFeePerformanceAdjustment',
    'PlatformFeeQuoteBand',
    'ProfessionalRegionCoverage',
    'ProgressReport'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS p2_admin_crud ON public.%I;', t);
      EXECUTE format(
        'CREATE POLICY p2_admin_crud ON public.%I FOR ALL TO authenticated USING (public.rls_is_admin()) WITH CHECK (public.rls_is_admin());',
        t
      );
    END IF;
  END LOOP;

  -- Admin read-only for log/report-view style tables.
  FOREACH t IN ARRAY ARRAY[
    'ReminderLog',
    'ProgressReportView'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = t
        AND c.relkind = 'r'
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS p3_admin_read_only ON public.%I;', t);
      EXECUTE format(
        'CREATE POLICY p3_admin_read_only ON public.%I FOR SELECT TO authenticated USING (public.rls_is_admin());',
        t
      );
    END IF;
  END LOOP;
END
$$;

-- Verification of new A2 policies.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('p2_admin_crud', 'p3_admin_read_only')
ORDER BY tablename, policyname;

-- Expected to remain for Phase B/security review (not opened here):
--   EscrowCheckoutOtpChallenge

COMMIT;
