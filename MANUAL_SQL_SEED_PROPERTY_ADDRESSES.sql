-- ============================================================================
-- Seed: a few residential units + variant spellings to exercise the model.
-- Idempotent: safe to re-run.
-- Prereq: MANUAL_SQL_ADD_PROPERTY_ADDRESS.sql must be applied first.
-- ============================================================================

-- District/area shorthands (HK colloquial names)
INSERT INTO "RegionAreaAlias" ("id", "areaId", "alias", "aliasNormalized") VALUES
  ('alias_tko',            'area_sai_kung',     'TKO',            'tko'),
  ('alias_tseung_kwan_o',  'area_sai_kung',     'Tseung Kwan O',  'tseung kwan o'),
  ('alias_fotan',          'area_sha_tin',      'Fo Tan',         'fo tan')
ON CONFLICT ("areaId", "aliasNormalized") DO NOTHING;

-- Canonical residential units (one row per physical unit)
INSERT INTO "Property" (
  "id", "unitNumber", "floorLevel", "blockTower", "buildingName",
  "districtAreaId", "zoneId", "displayAddress", "canonicalKey", "addressVisible"
) VALUES
  (
    'prop_tko_wings_t3_12a',
    'A', '12', 'Tower 3', 'The Wings II',
    'area_sai_kung', 'zone_nte',
    'Flat A, 12/F, Tower 3, The Wings II, Tseung Kwan O',
    md5(lower('the wings ii|tower 3|12|a|area_sai_kung')), true
  ),
  (
    'prop_st_festival_b1_08c',
    'C', '8', 'Block 1', 'Festival City',
    'area_sha_tin', 'zone_nte',
    'Flat C, 8/F, Block 1, Festival City, Sha Tin',
    md5(lower('festival city|block 1|8|c|area_sha_tin')), true
  ),
  (
    'prop_klc_onehomantin_t2_21d',
    'D', '21', 'Tower 2', 'One Homantin',
    'area_kowloon_city', 'zone_kln',
    'Flat D, 21/F, Tower 2, One Homantin, Kowloon City',
    md5(lower('one homantin|tower 2|21|d|area_kowloon_city')), true
  )
ON CONFLICT ("id") DO NOTHING;

-- Unresolved variant spellings (canonicalKey left NULL; flagged for admin)
INSERT INTO "Property" (
  "id", "unitNumber", "floorLevel", "blockTower", "buildingName",
  "districtAreaId", "zoneId", "displayAddress", "addressVisible"
) VALUES
  (
    'prop_variant_tko_wings2',
    'A', '12', 'Tower 3', 'The Wings 2',
    'area_sai_kung', 'zone_nte',
    'Flat A, 12/F, Tower 3, The Wings 2, Tseung Kwan O', true
  ),
  (
    'prop_variant_st_festival_phase1',
    'C', '8', 'Block 1', 'Festival City Phase 1',
    'area_sha_tin', 'zone_nte',
    'Flat C, 8/F, Block 1, Festival City Phase 1, Sha Tin', true
  )
ON CONFLICT ("id") DO NOTHING;

-- Building aliases (feed the normaliser)
INSERT INTO "PropertyAlias" ("id", "propertyId", "alias", "aliasNormalized") VALUES
  ('palias_tko_wings_ii',        'prop_tko_wings_t3_12a',      'The Wings II',          'the wings ii'),
  ('palias_tko_wings_2',         'prop_tko_wings_t3_12a',      'The Wings 2',           'the wings 2'),
  ('palias_st_festival',         'prop_st_festival_b1_08c',    'Festival City',         'festival city'),
  ('palias_st_festival_phase1',  'prop_st_festival_b1_08c',    'Festival City Phase 1', 'festival city phase 1')
ON CONFLICT ("propertyId", "aliasNormalized") DO NOTHING;

-- Admin flag queue: canonical vs variant (never auto-merge — admin reviews)
INSERT INTO "PropertyMatchCandidate" (
  "id", "sourcePropertyId", "candidatePropertyId", "similarity", "reasons", "status"
) VALUES
  (
    'match_tko_wings',
    'prop_tko_wings_t3_12a', 'prop_variant_tko_wings2',
    0.91, '["building name close: The Wings II vs The Wings 2"]'::jsonb, 'pending'
  ),
  (
    'match_st_festival',
    'prop_st_festival_b1_08c', 'prop_variant_st_festival_phase1',
    0.88, '["building name close: Festival City vs Festival City Phase 1"]'::jsonb, 'pending'
  )
ON CONFLICT ("id") DO NOTHING;

-- ── Linking accounts (persona-scoped) — example only ──
-- Persona ids are environment-specific; run after registering personas, e.g.:
-- INSERT INTO "PropertyAccountLink" ("id", "propertyId", "personaId", "role")
-- VALUES ('link_landlord_tko', 'prop_tko_wings_t3_12a', '<landlord persona id>', 'LANDLORD')
-- ON CONFLICT ("propertyId", "personaId") DO NOTHING;
