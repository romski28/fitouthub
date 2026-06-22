-- Flush all next-step caches so new labels (Visit site at HH:MM on ddd) take effect
UPDATE "Project" SET "nextStepCache" = NULL;
