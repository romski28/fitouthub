-- Phase 1: Normalize region zones/areas for structured coverage and map integration
CREATE TABLE "RegionZone" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "labelZh" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "mapSvgId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RegionZone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegionZone_code_key" ON "RegionZone"("code");
CREATE UNIQUE INDEX "RegionZone_mapSvgId_key" ON "RegionZone"("mapSvgId");
CREATE INDEX "RegionZone_sortOrder_idx" ON "RegionZone"("sortOrder");

CREATE TABLE "RegionArea" (
  "id" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameZh" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RegionArea_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegionArea_code_key" ON "RegionArea"("code");
CREATE UNIQUE INDEX "RegionArea_zoneId_name_key" ON "RegionArea"("zoneId", "name");
CREATE INDEX "RegionArea_zoneId_sortOrder_idx" ON "RegionArea"("zoneId", "sortOrder");

ALTER TABLE "RegionArea"
  ADD CONSTRAINT "RegionArea_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "RegionZone"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "RegionAreaAlias" (
  "id" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "aliasNormalized" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RegionAreaAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegionAreaAlias_areaId_aliasNormalized_key"
  ON "RegionAreaAlias"("areaId", "aliasNormalized");

CREATE INDEX "RegionAreaAlias_aliasNormalized_idx"
  ON "RegionAreaAlias"("aliasNormalized");

ALTER TABLE "RegionAreaAlias"
  ADD CONSTRAINT "RegionAreaAlias_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "RegionArea"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProfessionalRegionCoverage" (
  "id" TEXT NOT NULL,
  "professionalId" TEXT NOT NULL,
  "zoneId" TEXT NOT NULL,
  "areaId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProfessionalRegionCoverage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfessionalRegionCoverage_professionalId_idx"
  ON "ProfessionalRegionCoverage"("professionalId");

CREATE INDEX "ProfessionalRegionCoverage_zoneId_idx"
  ON "ProfessionalRegionCoverage"("zoneId");

CREATE INDEX "ProfessionalRegionCoverage_areaId_idx"
  ON "ProfessionalRegionCoverage"("areaId");

CREATE UNIQUE INDEX "ProfessionalRegionCoverage_professional_zone_area_key"
  ON "ProfessionalRegionCoverage"("professionalId", "zoneId", "areaId");

CREATE UNIQUE INDEX "ProfessionalRegionCoverage_professional_zone_nullarea_key"
  ON "ProfessionalRegionCoverage"("professionalId", "zoneId")
  WHERE "areaId" IS NULL;

ALTER TABLE "ProfessionalRegionCoverage"
  ADD CONSTRAINT "ProfessionalRegionCoverage_professionalId_fkey"
  FOREIGN KEY ("professionalId") REFERENCES "Professional"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProfessionalRegionCoverage"
  ADD CONSTRAINT "ProfessionalRegionCoverage_zoneId_fkey"
  FOREIGN KEY ("zoneId") REFERENCES "RegionZone"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProfessionalRegionCoverage"
  ADD CONSTRAINT "ProfessionalRegionCoverage_areaId_fkey"
  FOREIGN KEY ("areaId") REFERENCES "RegionArea"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed macro zones (5)
INSERT INTO "RegionZone" ("id", "code", "label", "labelZh", "sortOrder", "mapSvgId") VALUES
  ('zone_hki', 'HKI', 'Hong Kong Island', '香港島', 1, 'zone-hki'),
  ('zone_kln', 'KLN', 'Kowloon', '九龍', 2, 'zone-kln'),
  ('zone_nte', 'NTE', 'New Territories East', '新界東', 3, 'zone-nte'),
  ('zone_ntw', 'NTW', 'New Territories West', '新界西', 4, 'zone-ntw'),
  ('zone_isl', 'ISL', 'Islands', '離島', 5, 'zone-isl');

-- Seed district-level areas (18)
INSERT INTO "RegionArea" ("id", "zoneId", "code", "name", "nameZh", "sortOrder") VALUES
  ('area_central_western', 'zone_hki', 'CENTRAL_WESTERN', 'Central and Western', '中西區', 1),
  ('area_wan_chai', 'zone_hki', 'WAN_CHAI', 'Wan Chai', '灣仔區', 2),
  ('area_eastern', 'zone_hki', 'EASTERN', 'Eastern', '東區', 3),
  ('area_southern', 'zone_hki', 'SOUTHERN', 'Southern', '南區', 4),

  ('area_yau_tsim_mong', 'zone_kln', 'YAU_TSIM_MONG', 'Yau Tsim Mong', '油尖旺區', 1),
  ('area_sham_shui_po', 'zone_kln', 'SHAM_SHUI_PO', 'Sham Shui Po', '深水埗區', 2),
  ('area_kowloon_city', 'zone_kln', 'KOWLOON_CITY', 'Kowloon City', '九龍城區', 3),
  ('area_wong_tai_sin', 'zone_kln', 'WONG_TAI_SIN', 'Wong Tai Sin', '黃大仙區', 4),
  ('area_kwun_tong', 'zone_kln', 'KWUN_TONG', 'Kwun Tong', '觀塘區', 5),

  ('area_sai_kung', 'zone_nte', 'SAI_KUNG', 'Sai Kung', '西貢區', 1),
  ('area_sha_tin', 'zone_nte', 'SHA_TIN', 'Sha Tin', '沙田區', 2),
  ('area_tai_po', 'zone_nte', 'TAI_PO', 'Tai Po', '大埔區', 3),
  ('area_north', 'zone_nte', 'NORTH', 'North', '北區', 4),

  ('area_tuen_mun', 'zone_ntw', 'TUEN_MUN', 'Tuen Mun', '屯門區', 1),
  ('area_yuen_long', 'zone_ntw', 'YUEN_LONG', 'Yuen Long', '元朗區', 2),
  ('area_tsuen_wan', 'zone_ntw', 'TSUEN_WAN', 'Tsuen Wan', '荃灣區', 3),
  ('area_kwai_tsing', 'zone_ntw', 'KWAI_TSING', 'Kwai Tsing', '葵青區', 4),

  ('area_islands', 'zone_isl', 'ISLANDS', 'Islands District', '離島區', 1);

-- Seed aliases for matching and normalization
INSERT INTO "RegionAreaAlias" ("id", "areaId", "alias", "aliasNormalized") VALUES
  ('alias_central_and_western', 'area_central_western', 'central and western', 'central and western'),
  ('alias_central_western', 'area_central_western', 'central western', 'central western'),
  ('alias_wan_chai', 'area_wan_chai', 'wan chai', 'wan chai'),
  ('alias_wanchai', 'area_wan_chai', 'wanchai', 'wanchai'),
  ('alias_eastern', 'area_eastern', 'eastern', 'eastern'),
  ('alias_southern', 'area_southern', 'southern', 'southern'),

  ('alias_yau_tsim_mong', 'area_yau_tsim_mong', 'yau tsim mong', 'yau tsim mong'),
  ('alias_ytm', 'area_yau_tsim_mong', 'ytm', 'ytm'),
  ('alias_sham_shui_po', 'area_sham_shui_po', 'sham shui po', 'sham shui po'),
  ('alias_kowloon_city', 'area_kowloon_city', 'kowloon city', 'kowloon city'),
  ('alias_wong_tai_sin', 'area_wong_tai_sin', 'wong tai sin', 'wong tai sin'),
  ('alias_kwun_tong', 'area_kwun_tong', 'kwun tong', 'kwun tong'),

  ('alias_sai_kung', 'area_sai_kung', 'sai kung', 'sai kung'),
  ('alias_sha_tin', 'area_sha_tin', 'sha tin', 'sha tin'),
  ('alias_tai_po', 'area_tai_po', 'tai po', 'tai po'),
  ('alias_north', 'area_north', 'north', 'north'),

  ('alias_tuen_mun', 'area_tuen_mun', 'tuen mun', 'tuen mun'),
  ('alias_yuen_long', 'area_yuen_long', 'yuen long', 'yuen long'),
  ('alias_tsuen_wan', 'area_tsuen_wan', 'tsuen wan', 'tsuen wan'),
  ('alias_kwai_tsing', 'area_kwai_tsing', 'kwai tsing', 'kwai tsing'),

  ('alias_islands_district', 'area_islands', 'islands district', 'islands district'),
  ('alias_islands', 'area_islands', 'islands', 'islands');