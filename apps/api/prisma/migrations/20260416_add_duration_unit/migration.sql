-- AddColumn: quoteEstimatedDurationUnit to ProjectProfessional
-- Allows storing duration in either 'hours' or 'days' instead of minutes only
ALTER TABLE "ProjectProfessional" ADD COLUMN "quoteEstimatedDurationUnit" TEXT NOT NULL DEFAULT 'hours';

-- Create constraint to ensure valid enum values
ALTER TABLE "ProjectProfessional" ADD CONSTRAINT "ProjectProfessional_quoteEstimatedDurationUnit_check" 
  CHECK ("quoteEstimatedDurationUnit" IN ('hours', 'days'));
