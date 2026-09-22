-- ============================================================================
-- Rename the client "Approve milestone" next-step to reflect that it is a
-- decision step (review + approve/reject the pro's sign-off request), now
-- unified with payment release. Idempotent.
-- ============================================================================

UPDATE "NextStepConfig"
SET
  "actionLabel" = 'Review milestone sign-off',
  "description" = 'Review the professional''s milestone sign-off request and approve (releases payment) or request changes.',
  "modalTitle" = 'Review milestone sign-off',
  "modalBody" = 'The professional has submitted evidence that a milestone is complete. Review the work and decide: approve to sign off and release payment, or request changes.',
  "modalDetailsBody" = 'Carefully inspect the work quality, material quality, and adherence to specifications before approving. Request changes if needed.'
WHERE "projectStage" = 'MILESTONE_PENDING'
  AND "role" = 'CLIENT'
  AND "actionKey" = 'APPROVE_MILESTONE';
