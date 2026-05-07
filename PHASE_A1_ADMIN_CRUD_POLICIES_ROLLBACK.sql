-- PHASE_A1_ADMIN_CRUD_POLICIES_ROLLBACK.sql
--
-- Rollback for PHASE_A1_ADMIN_CRUD_POLICIES.sql
--
-- Removes:
-- - p2_admin_crud policies on Phase A.1 allowlisted tables
-- - helper function public.rls_is_admin()

BEGIN;

DO $$
DECLARE
  t text;
BEGIN
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
    END IF;
  END LOOP;
END
$$;

DROP FUNCTION IF EXISTS public.rls_is_admin();

-- Verification: should return zero rows after rollback.
SELECT
  schemaname,
  tablename,
  policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname = 'p2_admin_crud'
ORDER BY tablename;

COMMIT;
