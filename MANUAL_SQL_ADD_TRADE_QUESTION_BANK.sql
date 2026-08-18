-- TradeQuestion — deterministic question bank for the AI conversational wizard.
-- Keyed by trade x mode (repair|refresh|design) x element.
-- These rows are the "source of truth" for questions; the LLM (Pass B) only writes
-- the conversational acknowledgment and decides wrap-up.
-- element 'general' matches any element for that trade+mode.
--
-- Run against the production DB AFTER the schema change is deployed, then run
-- `prisma generate` so the API client can see the new model.
--
-- Add more trades later by appending rows to the VALUES list below.
-- Element vocabulary (extend as needed):
--   general, floor, wall, finish, lighting, sockets, wiring, sanitary, wc, basin,
--   water-heater, tap, cabinetry, door, shelving, structural, waterproofing, demolition

CREATE TABLE IF NOT EXISTS "TradeQuestion" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tradeId"   TEXT NOT NULL,
  "mode"      TEXT NOT NULL,
  "element"   TEXT NOT NULL DEFAULT 'general',
  "question"  TEXT NOT NULL,
  "options"   JSONB NOT NULL DEFAULT '[]'::jsonb,
  "priority"  INTEGER NOT NULL DEFAULT 0,
  "locale"    TEXT NOT NULL DEFAULT 'en',
  "isActive"  BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "TradeQuestion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TradeQuestion_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Tradesman"("id") ON DELETE CASCADE,
  CONSTRAINT "TradeQuestion_trade_mode_element_key" UNIQUE ("tradeId", "mode", "element")
);

CREATE INDEX "TradeQuestion_mode_idx" ON "TradeQuestion"("mode");
CREATE INDEX "TradeQuestion_element_idx" ON "TradeQuestion"("element");
CREATE INDEX "TradeQuestion_active_idx" ON "TradeQuestion"("isActive");
CREATE INDEX "TradeQuestion_tradeId_idx" ON "TradeQuestion"("tradeId");

-- Seed. Resilient to missing trades (JOIN drops unknown titles) and idempotent
-- (ON CONFLICT DO NOTHING against the unique (tradeId, mode, element) key).

WITH seed(trade_title, mode, element, question, options, priority) AS (
  VALUES
    -- ── Plumber ─────────────────────────────────────────────
    ('Plumber', 'design', 'sanitary',      'Would you like a bath, a shower, or both?',                                  '[{"label":"Bath","value":"bath"},{"label":"Shower","value":"shower"},{"label":"Both","value":"both"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Plumber', 'design', 'wc',            'Would you like a wall-hung or floor-standing toilet?',                       '[{"label":"Wall-hung","value":"wall-hung"},{"label":"Floor-standing","value":"floor-standing"},{"label":"Not sure","value":"not sure"}]'::jsonb, 2),
    ('Plumber', 'design', 'basin',         'Would you like a wall-hung or countertop basin?',                            '[{"label":"Wall-hung","value":"wall-hung"},{"label":"Countertop","value":"countertop"},{"label":"Not sure","value":"not sure"}]'::jsonb, 3),
    ('Plumber', 'design', 'water-heater',  'Do you need a new water heater — storage tank or instant?',                  '[{"label":"Storage tank","value":"storage-tank"},{"label":"Instant (on-demand)","value":"instant"},{"label":"Not sure","value":"not sure"}]'::jsonb, 4),
    ('Plumber', 'repair', 'general',       'What exactly is the plumbing issue — a leak, a blockage, or low pressure?',  '[{"label":"Leak","value":"leak"},{"label":"Blockage","value":"blockage"},{"label":"Low pressure","value":"low-pressure"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Plumber', 'repair', 'tap',           'Is the tap leaking from the spout or the base?',                              '[{"label":"Spout","value":"spout"},{"label":"Base","value":"base"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Plumber', 'refresh', 'tap',          'Would you like to replace just the tap or the whole vanity fitting?',        '[{"label":"Tap only","value":"tap-only"},{"label":"Whole fitting","value":"whole-fitting"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),

    -- ── Electrician ─────────────────────────────────────────
    ('Electrician', 'design', 'lighting',  'What kind of lighting would you like — recessed spots, pendants, or mirror lights?', '[{"label":"Recessed spots","value":"recessed"},{"label":"Pendants","value":"pendants"},{"label":"Mirror lights","value":"mirror-lights"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Electrician', 'design', 'sockets',   'How many extra socket points do you need?',                                   '[{"label":"1-2","value":"1-2"},{"label":"3-5","value":"3-5"},{"label":"More than 5","value":"more-than-5"},{"label":"Not sure","value":"not sure"}]'::jsonb, 2),
    ('Electrician', 'design', 'wiring',    'Does the space need a full rewire, or just new points on the existing circuit?', '[{"label":"Full rewire","value":"full-rewire"},{"label":"New points only","value":"new-points"},{"label":"Not sure","value":"not sure"}]'::jsonb, 3),
    ('Electrician', 'repair', 'general',   'What is the electrical fault — no power, a tripping breaker, or a sparking outlet?', '[{"label":"No power","value":"no-power"},{"label":"Tripping breaker","value":"tripping-breaker"},{"label":"Sparking outlet","value":"sparking-outlet"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Electrician', 'repair', 'lighting',  'Is the fitting dead, flickering, or is the switch faulty?',                   '[{"label":"Dead fitting","value":"dead-fitting"},{"label":"Flickering","value":"flickering"},{"label":"Faulty switch","value":"faulty-switch"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Electrician', 'refresh', 'lighting', 'Are you replacing existing light fittings like-for-like, or relocating them?', '[{"label":"Like-for-like","value":"like-for-like"},{"label":"Relocating","value":"relocating"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),

    -- ── Carpenter ───────────────────────────────────────────
    ('Carpenter', 'design', 'cabinetry',   'Would you like built-in cabinetry, and in what finish?',                      '[{"label":"Laminate","value":"laminate"},{"label":"Veneer","value":"veneer"},{"label":"Solid wood","value":"solid-wood"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Carpenter', 'design', 'door',        'What type of doors would you like — solid, hollow-core, or sliding?',         '[{"label":"Solid","value":"solid"},{"label":"Hollow-core","value":"hollow-core"},{"label":"Sliding","value":"sliding"},{"label":"Not sure","value":"not sure"}]'::jsonb, 2),
    ('Carpenter', 'repair', 'door',        'Is the door sticking, damaged, or needing a lock replacement?',               '[{"label":"Sticking","value":"sticking"},{"label":"Damaged","value":"damaged"},{"label":"Lock replacement","value":"lock-replacement"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Carpenter', 'refresh', 'shelving',   'What type of shelving would you like — floating, built-in, or freestanding?', '[{"label":"Floating","value":"floating"},{"label":"Built-in","value":"built-in"},{"label":"Freestanding","value":"freestanding"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Carpenter', 'design', 'general',     'Is there any custom joinery — wardrobes, shelving, or a feature wall?',        '[{"label":"Wardrobes","value":"wardrobes"},{"label":"Shelving","value":"shelving"},{"label":"Feature wall","value":"feature-wall"},{"label":"None","value":"none"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),

    -- ── Painter ─────────────────────────────────────────────
    ('Painter', 'design', 'wall',          'Would you like paint, wallpaper, or a combination?',                          '[{"label":"Paint","value":"paint"},{"label":"Wallpaper","value":"wallpaper"},{"label":"Combination","value":"combination"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Painter', 'design', 'finish',        'What paint finish would you like — matte, eggshell, or satin?',                '[{"label":"Matte","value":"matte"},{"label":"Eggshell","value":"eggshell"},{"label":"Satin","value":"satin"},{"label":"Not sure","value":"not sure"}]'::jsonb, 2),
    ('Painter', 'repair', 'general',       'What needs painting — a patch repair, a full room, or the whole unit?',        '[{"label":"Patch","value":"patch"},{"label":"Full room","value":"full-room"},{"label":"Whole unit","value":"whole-unit"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Painter', 'refresh', 'wall',         'Would you like a colour change or a like-for-like repaint?',                   '[{"label":"Colour change","value":"colour-change"},{"label":"Like-for-like repaint","value":"like-for-like"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Painter', 'design', 'general',       'Which areas need painting — one room, several, or the whole property?',        '[{"label":"One room","value":"one-room"},{"label":"Several rooms","value":"several-rooms"},{"label":"Whole property","value":"whole-property"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),

    -- ── Tiler ───────────────────────────────────────────────
    ('Tiler', 'design', 'floor',           'What flooring would you like — porcelain tile, marble, or vinyl?',            '[{"label":"Porcelain tile","value":"porcelain-tile"},{"label":"Marble","value":"marble"},{"label":"Vinyl","value":"vinyl"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Tiler', 'design', 'wall',            'Would you like the walls fully tiled or half-height?',                         '[{"label":"Fully tiled","value":"fully-tiled"},{"label":"Half-height","value":"half-height"},{"label":"Not sure","value":"not sure"}]'::jsonb, 2),
    ('Tiler', 'repair', 'general',         'Are the tiles cracked, loose, or is the grout failing?',                       '[{"label":"Cracked","value":"cracked"},{"label":"Loose","value":"loose"},{"label":"Grout failing","value":"grout-failing"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Tiler', 'refresh', 'floor',          'Are you retiling over the existing floor, or removing the old tiles first?',   '[{"label":"Over existing","value":"over-existing"},{"label":"Remove first","value":"remove-first"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Tiler', 'design', 'general',         'Do you have a tile style in mind — large format, mosaic, or subway?',           '[{"label":"Large format","value":"large-format"},{"label":"Mosaic","value":"mosaic"},{"label":"Subway","value":"subway"},{"label":"Not sure","value":"not sure"}]'::jsonb, 2),

    -- ── Builder ─────────────────────────────────────────────
    ('Builder', 'design', 'structural',    'Are there any structural changes — removing walls, adding partitions, or extending?', '[{"label":"Remove walls","value":"remove-walls"},{"label":"Add partitions","value":"add-partitions"},{"label":"Extension","value":"extension"},{"label":"None","value":"none"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Builder', 'design', 'waterproofing', 'Does the renovation include re-waterproofing the wet areas?',                  '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not sure","value":"not sure"}]'::jsonb, 2),
    ('Builder', 'design', 'demolition',    'Is there any demolition or site clearance needed before works begin?',         '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not sure","value":"not sure"}]'::jsonb, 3),
    ('Builder', 'repair', 'general',       'What needs structural attention — cracks, damp, or a failing wall or ceiling?', '[{"label":"Cracks","value":"cracks"},{"label":"Damp","value":"damp"},{"label":"Failing wall or ceiling","value":"failing-surface"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1),
    ('Builder', 'refresh', 'general',      'Is this a cosmetic refresh of finishes, or does it involve structural or layout changes?', '[{"label":"Cosmetic only","value":"cosmetic-only"},{"label":"Structural or layout changes","value":"structural-layout"},{"label":"Not sure","value":"not sure"}]'::jsonb, 1)
)
INSERT INTO "TradeQuestion" ("tradeId", "mode", "element", "question", "options", "priority", "locale", "isActive")
SELECT t.id, s.mode, s.element, s.question, s.options, s.priority, 'en', true
FROM seed s
JOIN "Tradesman" t ON t.title = s.trade_title
ON CONFLICT ("tradeId", "mode", "element") DO NOTHING;
