-- Seed MilestoneTemplate data for various trades
-- This inserts preset milestone stages for common renovation trades

-- Note: Replace TRADESMAN_ID with actual IDs from your Tradesman table
-- You can run: SELECT id, title FROM "Tradesman" ORDER BY title;
-- Then manually replace the IDs or run this script multiple times for different trades

-- Helper: Get trade IDs (for reference - adjust based on your IDs)
-- SELECT id, title, professionType FROM "Tradesman" LIMIT 20;

-- ELECTRICAL WORK (Electrician)
INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Site Inspection & Assessment', 1, 'Initial site visit to assess existing wiring and requirements', 1, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Electrician' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Circuit Planning & Design', 2, 'Plan electrical circuits and obtain necessary permits', 3, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Electrician' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Material Procurement', 3, 'Order and receive electrical materials and equipment', 5, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Electrician' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Rough-in Wiring', 4, 'Run new wiring through walls and install boxes', 5, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Electrician' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Panel & Breaker Installation', 5, 'Install or upgrade electrical panel and breakers', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Electrician' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Outlet & Switch Installation', 6, 'Install outlets, switches, and light fixtures', 3, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Electrician' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'System Testing & Inspection', 7, 'Test all circuits and pass electrical inspection', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Electrician' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Final Approval & Sign-off', 8, 'Receive final inspection certificate and completion sign-off', 1, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Electrician' LIMIT 1;

-- PLUMBING WORK (Plumber)
INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Site Assessment', 1, 'Evaluate existing plumbing and code requirements', 1, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Plumber' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Design & Permits', 2, 'Design new plumbing layout and obtain permits', 3, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Plumber' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Demolition & Removal', 3, 'Remove old pipes and fixtures', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Plumber' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Water Supply Installation', 4, 'Install new supply lines and shut-off valves', 4, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Plumber' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Drain System Installation', 5, 'Install drainage pipes and venting', 4, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Plumber' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Fixture Installation', 6, 'Install sinks, toilets, showers, and tubs', 3, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Plumber' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Pressure Testing & Inspection', 7, 'Test system for leaks and pass inspection', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Plumber' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Final Cleanup & Approval', 8, 'Clean up and obtain final certificate', 1, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Plumber' LIMIT 1;

-- PAINTING (Painter)
INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Surface Preparation', 1, 'Clean, sand, and prime surfaces', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Painter' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Priming', 2, 'Apply primer coat where needed', 1, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Painter' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'First Coat Application', 3, 'Apply first coat of finish paint', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Painter' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Final Coat Application', 4, 'Apply second/final coat', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Painter' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Touch-ups & Final Inspection', 5, 'Complete touch-ups and final quality check', 1, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Painter' LIMIT 1;

-- CARPENTRY (Carpenter)
INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Design & Material Selection', 1, 'Finalize design and select materials', 3, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Carpenter' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Demolition & Preparation', 2, 'Remove old structures and prepare area', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Carpenter' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Framing & Structure', 3, 'Build frame and structural components', 5, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Carpenter' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Installation & Assembly', 4, 'Install doors, windows, cabinetry', 4, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Carpenter' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Finishing & Sanding', 5, 'Sand and finish all wood surfaces', 3, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Carpenter' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Final Inspection & Sign-off', 6, 'Quality inspection and completion', 1, NOW(), NOW()
FROM "Tradesman" t WHERE t.title = 'Carpenter' LIMIT 1;

-- TILE WORK (Tiler)
INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Design & Layout', 1, 'Plan tile layout and pattern', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%Tile%' OR t.title ILIKE '%Tiler%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Surface Preparation', 2, 'Prepare and level substrate', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%Tile%' OR t.title ILIKE '%Tiler%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Waterproofing', 3, 'Apply waterproof membrane if needed', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%Tile%' OR t.title ILIKE '%Tiler%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Mortar Application & Tiling', 4, 'Apply mortar and set tiles', 4, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%Tile%' OR t.title ILIKE '%Tiler%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Grouting', 5, 'Apply grout and seal joints', 3, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%Tile%' OR t.title ILIKE '%Tiler%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Curing & Final Inspection', 6, 'Allow to cure and final quality check', 2, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%Tile%' OR t.title ILIKE '%Tiler%' LIMIT 1;

-- GENERAL CONTRACTORS / RENOVATION (Multi-trade projects)
INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Planning & Design', 1, 'Finalize project design and schedule', 5, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Permits & Approvals', 2, 'Obtain all necessary permits and approvals', 7, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Demolition & Preparation', 3, 'Remove existing structures and prep site', 5, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Structural/Framing Phase', 4, 'Frame and structural work', 10, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'MEP Systems (Mechanical/Electrical/Plumbing)', 5, 'Install utilities and systems', 10, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Drywall & Insulation', 6, 'Install insulation and drywall', 5, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Flooring Installation', 7, 'Install all flooring materials', 5, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Final Finishes (Paint, Hardware, etc.)', 8, 'Paint, lighting, hardware installation', 5, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Final Inspections', 9, 'All inspections and approvals', 3, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;

INSERT INTO "MilestoneTemplate" ("id", "tradeId", "stageName", "sequence", "description", "estimatedDurationDays", "createdAt", "updatedAt")
SELECT 'mt_' || gen_random_uuid()::text, t.id, 'Final Cleanup & Handover', 10, 'Final cleanup and project handover', 1, NOW(), NOW()
FROM "Tradesman" t WHERE t.title ILIKE '%General Contractor%' OR t.title ILIKE '%Contractor%' LIMIT 1;
