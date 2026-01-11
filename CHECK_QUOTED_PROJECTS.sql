-- Check for projects with quoted professionals
-- This helps debug the pending quotations feature

-- Find all projects with quoted professionals
SELECT 
  p.id as project_id,
  p."projectName",
  p."userId",
  p."clientId",
  pp.id as professional_project_id,
  pp.status,
  pp."quoteAmount",
  pp."quotedAt",
  pp."professionalId"
FROM "Project" p
INNER JOIN "ProjectProfessional" pp ON pp."projectId" = p.id
WHERE pp.status = 'quoted'
ORDER BY pp."quotedAt" DESC;

-- Count by user
SELECT 
  COALESCE(p."userId", p."clientId") as owner_id,
  COUNT(*) as quoted_count
FROM "Project" p
INNER JOIN "ProjectProfessional" pp ON pp."projectId" = p.id
WHERE pp.status = 'quoted'
GROUP BY COALESCE(p."userId", p."clientId");
