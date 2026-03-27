-- ============================================================
-- Case Management Tables for Fitout Hub
-- Run these SQL statements in your Render PostgreSQL database
-- ============================================================

-- ============================================================
-- 1. Case number sequence (FOH-YYYY-NNNNN)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS "case_number_seq" START 1 INCREMENT 1;

-- ============================================================
-- 2. Main Case table
-- ============================================================
CREATE TABLE IF NOT EXISTS "Case" (
    "id"               TEXT         NOT NULL,
    "caseNumber"       TEXT         NOT NULL,
    "title"            TEXT,

    -- category: payment | delay | quality | safety | dispute | general
    "category"         TEXT         NOT NULL DEFAULT 'general',

    -- status: open | awaiting_client | in_progress | resolved | closed
    "status"           TEXT         NOT NULL DEFAULT 'open',

    -- priority: low | normal | high | urgent
    "priority"         TEXT         NOT NULL DEFAULT 'normal',

    -- who raised it
    "raisedBy"         TEXT         NOT NULL DEFAULT 'client',   -- client | professional | foh

    -- relations
    "projectId"        TEXT,
    "clientUserId"     TEXT,
    "professionalId"   TEXT,        -- professional who raised or is subject of the case
    "assignedAdminId"  TEXT,

    -- bound thread (at most one per case)
    "assistRequestId"  TEXT         UNIQUE,
    "privateChatId"    TEXT         UNIQUE,
    "supportRequestId" TEXT         UNIQUE,

    -- SLA
    "slaDeadline"      TIMESTAMP(3) NOT NULL,   -- createdAt + 1 hour
    "firstRepliedAt"   TIMESTAMP(3),
    "slaBreachedAt"    TIMESTAMP(3),
    "resolvedAt"       TIMESTAMP(3),

    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 3. Case internal notes (admin-only, never visible to parties)
-- ============================================================
CREATE TABLE IF NOT EXISTS "CaseNote" (
    "id"        TEXT         NOT NULL,
    "caseId"    TEXT         NOT NULL,
    "adminId"   TEXT         NOT NULL,
    "content"   TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseNote_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- 4. New columns on ProjectAssistRequest
-- ============================================================

-- Who raised it (client or professional)
ALTER TABLE "ProjectAssistRequest"
    ADD COLUMN IF NOT EXISTS "professionalId" TEXT;

-- Issue category maps to Case.category
ALTER TABLE "ProjectAssistRequest"
    ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'general';

-- Binding link back to the Case
ALTER TABLE "ProjectAssistRequest"
    ADD COLUMN IF NOT EXISTS "caseId" TEXT;

-- ============================================================
-- 5. Unique constraint & indexes on Case
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS "Case_caseNumber_key"  ON "Case"("caseNumber");

CREATE INDEX IF NOT EXISTS "Case_status_idx"          ON "Case"("status");
CREATE INDEX IF NOT EXISTS "Case_projectId_idx"       ON "Case"("projectId");
CREATE INDEX IF NOT EXISTS "Case_clientUserId_idx"    ON "Case"("clientUserId");
CREATE INDEX IF NOT EXISTS "Case_professionalId_idx"  ON "Case"("professionalId");
CREATE INDEX IF NOT EXISTS "Case_assignedAdminId_idx" ON "Case"("assignedAdminId");
CREATE INDEX IF NOT EXISTS "Case_slaDeadline_idx"     ON "Case"("slaDeadline");
CREATE INDEX IF NOT EXISTS "Case_createdAt_idx"       ON "Case"("createdAt");
CREATE INDEX IF NOT EXISTS "Case_category_idx"        ON "Case"("category");

-- ============================================================
-- 6. Indexes on CaseNote
-- ============================================================
CREATE INDEX IF NOT EXISTS "CaseNote_caseId_idx"   ON "CaseNote"("caseId");
CREATE INDEX IF NOT EXISTS "CaseNote_adminId_idx"  ON "CaseNote"("adminId");

-- ============================================================
-- 7. Indexes on new ProjectAssistRequest columns
-- ============================================================
CREATE INDEX IF NOT EXISTS "ProjectAssistRequest_professionalId_idx" ON "ProjectAssistRequest"("professionalId");
CREATE INDEX IF NOT EXISTS "ProjectAssistRequest_category_idx"       ON "ProjectAssistRequest"("category");
CREATE INDEX IF NOT EXISTS "ProjectAssistRequest_caseId_idx"         ON "ProjectAssistRequest"("caseId");

-- ============================================================
-- 8. FK constraints (safe to run independently if tables exist)
-- ============================================================
ALTER TABLE "CaseNote"
    ADD CONSTRAINT "CaseNote_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE;

ALTER TABLE "Case"
    ADD CONSTRAINT "Case_assistRequestId_fkey"
    FOREIGN KEY ("assistRequestId") REFERENCES "ProjectAssistRequest"("id") ON DELETE SET NULL;

-- ============================================================
-- 9. Helper function: generate next case number for current year
--    Returns e.g. 'FOH-2026-00001'
-- ============================================================
CREATE OR REPLACE FUNCTION next_case_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    seq_val BIGINT;
    yr      TEXT;
BEGIN
    seq_val := nextval('case_number_seq');
    yr      := TO_CHAR(NOW(), 'YYYY');
    RETURN 'FOH-' || yr || '-' || LPAD(seq_val::TEXT, 5, '0');
END;
$$;
