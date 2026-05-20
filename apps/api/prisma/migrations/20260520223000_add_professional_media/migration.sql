CREATE TYPE "ProfessionalMediaKind" AS ENUM ('STANDALONE', 'REFERENCE_PROJECT');

CREATE TABLE "ProfessionalMedia" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "kind" "ProfessionalMediaKind" NOT NULL DEFAULT 'STANDALONE',
    "description" TEXT,
    "isProfileFeature" BOOLEAN NOT NULL DEFAULT false,
    "profileFeatureSortOrder" INTEGER,
    "referenceProjectId" UUID,
    "projectSortOrder" INTEGER,
    "credit" TEXT,
    "copyrightNotice" TEXT,
    "sourceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfessionalMedia_professionalId_storageKey_key" ON "ProfessionalMedia"("professionalId", "storageKey");
CREATE INDEX "ProfessionalMedia_professionalId_kind_projectSortOrder_idx" ON "ProfessionalMedia"("professionalId", "kind", "projectSortOrder");
CREATE INDEX "ProfessionalMedia_professionalId_isProfileFeature_profileFeatureSortOrder_idx" ON "ProfessionalMedia"("professionalId", "isProfileFeature", "profileFeatureSortOrder");
CREATE INDEX "ProfessionalMedia_referenceProjectId_projectSortOrder_idx" ON "ProfessionalMedia"("referenceProjectId", "projectSortOrder");

ALTER TABLE "ProfessionalMedia"
    ADD CONSTRAINT "ProfessionalMedia_professionalId_fkey"
    FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProfessionalMedia"
    ADD CONSTRAINT "ProfessionalMedia_referenceProjectId_fkey"
    FOREIGN KEY ("referenceProjectId") REFERENCES "ProfessionalReferenceProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ProfessionalMedia" (
    "id",
    "professionalId",
    "storageKey",
    "kind",
    "isProfileFeature",
    "profileFeatureSortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    p."id",
    image_row."storageKey",
    'STANDALONE'::"ProfessionalMediaKind",
    TRUE,
    image_row."sortOrder",
    p."createdAt",
    CURRENT_TIMESTAMP
FROM "Professional" p
CROSS JOIN LATERAL unnest(p."profileImages") WITH ORDINALITY AS image_row("storageKey", "sortOrder")
WHERE COALESCE(image_row."storageKey", '') <> ''
ON CONFLICT ("professionalId", "storageKey") DO UPDATE SET
    "isProfileFeature" = TRUE,
    "profileFeatureSortOrder" = EXCLUDED."profileFeatureSortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ProfessionalMedia" (
    "id",
    "professionalId",
    "storageKey",
    "kind",
    "referenceProjectId",
    "projectSortOrder",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    rp."professionalId",
    image_row."storageKey",
    'REFERENCE_PROJECT'::"ProfessionalMediaKind",
    rp."id",
    image_row."sortOrder",
    rp."createdAt",
    CURRENT_TIMESTAMP
FROM "ProfessionalReferenceProject" rp
CROSS JOIN LATERAL unnest(rp."imageUrls") WITH ORDINALITY AS image_row("storageKey", "sortOrder")
WHERE COALESCE(image_row."storageKey", '') <> ''
ON CONFLICT ("professionalId", "storageKey") DO UPDATE SET
    "kind" = 'REFERENCE_PROJECT'::"ProfessionalMediaKind",
    "referenceProjectId" = EXCLUDED."referenceProjectId",
    "projectSortOrder" = EXCLUDED."projectSortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;