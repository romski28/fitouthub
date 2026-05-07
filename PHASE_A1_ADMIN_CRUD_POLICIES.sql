-- PHASE_A1_ADMIN_CRUD_POLICIES.sql
--
-- Adds explicit admin CRUD policies for core operational tables.
-- Intended to run AFTER:
--   1) ENABLE_RLS_ON_PUBLIC_TABLES.sql
--   2) PHASE_A_BASELINE_RLS_POLICIES.sql
--
-- Design:
-- - Admin CRUD is explicit and scoped by table allowlist.
-- - service_role already has full access from Phase A baseline.
-- - Security-sensitive/system tables are intentionally excluded.

BEGIN;

-- Helper: determine whether current JWT context should be treated as admin.
-- This supports common claim shapes used by PostgREST/Supabase.
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

-- Optional hardening: if you do not want anonymous execution of helper function,
-- uncomment below line.
-- REVOKE ALL ON FUNCTION public.rls_is_admin() FROM PUBLIC;

DO $$
DECLARE
  t text;
BEGIN
  -- Allowlist of operational tables for admin CRUD in Phase A.1
  -- (Most-used business entities; excludes tokens/otp/internal security artifacts.)
  FOREACH t IN ARRAY ARRAY[
    'User',
    'Professional',
    'Project',
    'ProjectPhoto',
    'ProjectProfessional',
    'ProjectMilestone',
    'ProjectPaymentPlan',
    'PaymentMilestone',
    'MilestoneProcurementEvidence',
    'ProjectStartProposal',
    'EscrowLedger',
    'FinancialTransaction',
    'PrivateChatThread',
    'PrivateChatMessage',
    'ProjectChatThread',
    'ProjectChatMessage',
    'NotificationPreference',
    'NotificationLog',
    'ServiceMapping',
    'Tradesman',
    'TradesmanTranslation',
    'MilestoneTemplate',
    'RegionZone',
    'RegionArea',
    'RegionAreaAlias'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS p2_admin_crud ON public.%I;', t);
      EXECUTE format(
        'CREATE POLICY p2_admin_crud ON public.%I FOR ALL TO authenticated USING (public.rls_is_admin()) WITH CHECK (public.rls_is_admin());',
        t
      );
    END IF;
  END LOOP;
END
$$;

-- Verification: list all Phase A.1 admin policies.
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname = 'p2_admin_crud'
ORDER BY tablename;

COMMIT;
