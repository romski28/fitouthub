-- Migrate existing projects from legacy status field to currentStage
-- Maps old status values to appropriate ProjectStage enum values

-- Update projects based on their current status and project data
UPDATE "Project" SET 
  "currentStage" = CASE
    -- Projects with awarded professionals should be in contract or active work phase
    WHEN status = 'awarded' AND "startDate" IS NOT NULL THEN 'WORK_IN_PROGRESS'::ProjectStage
    WHEN status = 'awarded' THEN 'CONTRACT_PHASE'::ProjectStage
    
    -- In-progress projects with start dates
    WHEN status = 'in_progress' OR status = 'active' THEN 'WORK_IN_PROGRESS'::ProjectStage
    
    -- Completed projects
    WHEN status = 'completed' AND "endDate" IS NOT NULL THEN 'COMPLETE'::ProjectStage
    WHEN status = 'completed' THEN 'NEAR_COMPLETION'::ProjectStage
    
    -- Withdrawn, cancelled, or disputed
    WHEN status = 'withdrawn' OR status = 'cancelled' THEN 'CLOSED'::ProjectStage
    WHEN status = 'disputed' THEN 'DISPUTED'::ProjectStage
    
    -- Open/pending projects - determine based on professionals invited
    WHEN status = 'pending' OR status = 'open' THEN
      CASE 
        -- Check if any professionals have been invited
        WHEN EXISTS (
          SELECT 1 FROM "ProjectProfessional" pp 
          WHERE pp."projectId" = "Project"."id"
        ) THEN 'BIDDING_ACTIVE'::ProjectStage
        ELSE 'CREATED'::ProjectStage
      END
    
    -- Default to CREATED for any unmatched status
    ELSE 'CREATED'::ProjectStage
  END,
  "lastStageTransitionAt" = COALESCE("lastStageTransitionAt", "updatedAt")
WHERE "currentStage" = 'CREATED'; -- Only update projects still at default CREATED stage

-- Log the migration results
DO $$
DECLARE
  migration_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migration_count FROM "Project" WHERE "currentStage" != 'CREATED';
  RAISE NOTICE 'Migrated % projects from legacy status to currentStage', migration_count;
END $$;
