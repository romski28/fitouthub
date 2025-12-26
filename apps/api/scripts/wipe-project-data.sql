BEGIN;
-- Wipe project-related data while preserving users and professionals
DELETE FROM "Message";
DELETE FROM "EmailToken";
DELETE FROM "ProjectProfessional";
DELETE FROM "Project";
COMMIT;
