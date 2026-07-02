-- PHASE_B_RLS_POLICIES.sql
--
-- Phase B: Add app-level RLS policies for tables flagged by Supabase.
-- Covers 18 tables in 3 categories.
--
-- Category 1: Lookup/catalog tables → public read (p1_lookup_read)
-- Category 2: Owned by user/professional → ownership-scoped (p2_pro_own / p2_user_own)
-- Category 3: System/internal → service_role only, flagged as intentional (p3_system_internal)
--
-- Idempotent — safe to re-run.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- Category 1: Lookup / reference tables (safe public read)
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'CertificationType') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."CertificationType";
    CREATE POLICY p1_lookup_read ON public."CertificationType"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'TradeCertificationRequirement') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."TradeCertificationRequirement";
    CREATE POLICY p1_lookup_read ON public."TradeCertificationRequirement"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'home_card_rail') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."home_card_rail";
    CREATE POLICY p1_lookup_read ON public."home_card_rail"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_intake_image_insights') THEN
    DROP POLICY IF EXISTS p1_lookup_read ON public."ai_intake_image_insights";
    CREATE POLICY p1_lookup_read ON public."ai_intake_image_insights"
      FOR SELECT TO anon, authenticated
      USING (true);
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Category 2: Owned by user or professional (ownership-scoped)
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Professional-owned tables: access via professionalId → Professional.userId
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ProfessionalCertification') THEN
    DROP POLICY IF EXISTS p2_pro_own ON public."ProfessionalCertification";
    CREATE POLICY p2_pro_own ON public."ProfessionalCertification"
      FOR ALL TO authenticated
      USING (
        "professionalId" IN (
          SELECT id FROM public."Professional" WHERE "userId" = auth.uid()
        )
      )
      WITH CHECK (
        "professionalId" IN (
          SELECT id FROM public."Professional" WHERE "userId" = auth.uid()
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ProfessionalAvailability') THEN
    DROP POLICY IF EXISTS p2_pro_own ON public."ProfessionalAvailability";
    CREATE POLICY p2_pro_own ON public."ProfessionalAvailability"
      FOR ALL TO authenticated
      USING (
        "professionalId" IN (
          SELECT id FROM public."Professional" WHERE "userId" = auth.uid()
        )
      )
      WITH CHECK (
        "professionalId" IN (
          SELECT id FROM public."Professional" WHERE "userId" = auth.uid()
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ProfessionalMedia') THEN
    DROP POLICY IF EXISTS p2_pro_own ON public."ProfessionalMedia";
    CREATE POLICY p2_pro_own ON public."ProfessionalMedia"
      FOR ALL TO authenticated
      USING (
        "professionalId" IN (
          SELECT id FROM public."Professional" WHERE "userId" = auth.uid()
        )
      )
      WITH CHECK (
        "professionalId" IN (
          SELECT id FROM public."Professional" WHERE "userId" = auth.uid()
        )
      );
  END IF;

  -- User-owned tables: direct userId match
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'PushSubscription') THEN
    DROP POLICY IF EXISTS p2_user_own ON public."PushSubscription";
    CREATE POLICY p2_user_own ON public."PushSubscription"
      FOR ALL TO authenticated
      USING ("userId" = auth.uid())
      WITH CHECK ("userId" = auth.uid());
  END IF;

  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ux_feedback') THEN
    DROP POLICY IF EXISTS p2_user_own ON public."ux_feedback";
    CREATE POLICY p2_user_own ON public."ux_feedback"
      FOR ALL TO authenticated
      USING ("userId" = auth.uid())
      WITH CHECK ("userId" = auth.uid());
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Category 3: System/internal tables (service_role only, intentional)
-- These are accessed exclusively through the NestJS API.
-- Adding a no-op authenticated guard silences Supabase warnings
-- while maintaining deny-by-default for direct access.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
  v_tables TEXT[] := ARRAY[
    'EscrowCheckoutOtpChallenge',
    'ProspectiveLeadEvent',
    'client_site_addresses',
    'mimo_calendar_events',
    'mimo_calendar_event_participants',
    'mimo_project_extras',
    'mimo_survey_assignments',
    'mimo_survey_workspace_reports',
    'project_sites'
  ];
BEGIN
  FOREACH r IN ARRAY v_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = r) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = r AND policyname = 'p3_system_internal'
      ) THEN
        EXECUTE format(
          'CREATE POLICY p3_system_internal ON public."%I" FOR ALL TO authenticated USING (false);',
          r
        );
      END IF;
    END IF;
  END LOOP;
END
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Verification
-- ═══════════════════════════════════════════════════════════════════

-- Tables that still have no app-level policy (should be empty after Phase B)
SELECT
  c.relname AS table_still_needing_policy
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

-- Policy summary
SELECT
  c.relname AS table_name,
  COUNT(p.*) AS policy_count,
  STRING_AGG(p.policyname, ', ' ORDER BY p.policyname) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname = ANY(ARRAY[
    'CertificationType','TradeCertificationRequirement','home_card_rail','ai_intake_image_insights',
    'ProfessionalCertification','ProfessionalAvailability','ProfessionalMedia','PushSubscription','ux_feedback',
    'EscrowCheckoutOtpChallenge','ProspectiveLeadEvent','client_site_addresses',
    'mimo_calendar_events','mimo_calendar_event_participants','mimo_project_extras',
    'mimo_survey_assignments','mimo_survey_workspace_reports','project_sites'
  ])
GROUP BY c.relname
ORDER BY c.relname;

COMMIT;
