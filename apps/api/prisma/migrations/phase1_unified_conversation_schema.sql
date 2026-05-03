-- ============================================================
-- Phase 1: Unified Conversation Schema
-- Run manually against the remote PostgreSQL database.
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING guards).
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ConversationContainerType" AS ENUM (
    'project',
    'projectProfessional',
    'fohSupport',
    'anonymous'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationChannelKey" AS ENUM (
    'team',
    'bidding',
    'support'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationActorType" AS ENUM (
    'user',
    'professional',
    'foh',
    'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Conversation ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Conversation" (
  "id"            TEXT NOT NULL,
  "containerType" "ConversationContainerType" NOT NULL,
  "containerId"   TEXT NOT NULL,
  "channelKey"    "ConversationChannelKey" NOT NULL,
  "scopeKey"      TEXT NOT NULL DEFAULT 'general',
  "status"        TEXT NOT NULL DEFAULT 'open',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one conversation per (container, channel, scope)
DO $$ BEGIN
  ALTER TABLE "Conversation"
    ADD CONSTRAINT "Conversation_containerType_containerId_channelKey_scopeKey_key"
    UNIQUE ("containerType", "containerId", "channelKey", "scopeKey");
EXCEPTION WHEN duplicate_table THEN NULL;
         WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Conversation_containerType_containerId_idx"
  ON "Conversation" ("containerType", "containerId");

CREATE INDEX IF NOT EXISTS "Conversation_channelKey_idx"
  ON "Conversation" ("channelKey");

CREATE INDEX IF NOT EXISTS "Conversation_updatedAt_idx"
  ON "Conversation" ("updatedAt");

-- ── ConversationParticipant ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ConversationParticipant" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "actorType"      "ConversationActorType" NOT NULL,
  "actorId"        TEXT NOT NULL,
  "role"           TEXT NOT NULL,
  "joinedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt"         TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationParticipant_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
);

DO $$ BEGIN
  ALTER TABLE "ConversationParticipant"
    ADD CONSTRAINT "ConversationParticipant_conversationId_actorType_actorId_key"
    UNIQUE ("conversationId", "actorType", "actorId");
EXCEPTION WHEN duplicate_table THEN NULL;
         WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ConversationParticipant_conversationId_idx"
  ON "ConversationParticipant" ("conversationId");

CREATE INDEX IF NOT EXISTS "ConversationParticipant_actorType_actorId_idx"
  ON "ConversationParticipant" ("actorType", "actorId");

-- ── ConversationMessage ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ConversationMessage" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderType"     "ConversationActorType" NOT NULL,
  "senderActorId"  TEXT NOT NULL,
  "content"        TEXT NOT NULL,
  "attachments"    JSONB NOT NULL DEFAULT '[]',
  "metadata"       JSONB,
  "deletedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationMessage_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ConversationMessage_conversationId_idx"
  ON "ConversationMessage" ("conversationId");

CREATE INDEX IF NOT EXISTS "ConversationMessage_conversationId_createdAt_idx"
  ON "ConversationMessage" ("conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "ConversationMessage_senderType_senderActorId_idx"
  ON "ConversationMessage" ("senderType", "senderActorId");

CREATE INDEX IF NOT EXISTS "ConversationMessage_createdAt_idx"
  ON "ConversationMessage" ("createdAt");

-- ── ConversationReadState ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ConversationReadState" (
  "id"                TEXT NOT NULL,
  "conversationId"    TEXT NOT NULL,
  "actorType"         "ConversationActorType" NOT NULL,
  "actorId"           TEXT NOT NULL,
  "lastReadMessageId" TEXT,
  "lastReadAt"        TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConversationReadState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationReadState_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
  CONSTRAINT "ConversationReadState_lastReadMessageId_fkey"
    FOREIGN KEY ("lastReadMessageId") REFERENCES "ConversationMessage"("id") ON DELETE SET NULL
);

DO $$ BEGIN
  ALTER TABLE "ConversationReadState"
    ADD CONSTRAINT "ConversationReadState_conversationId_actorType_actorId_key"
    UNIQUE ("conversationId", "actorType", "actorId");
EXCEPTION WHEN duplicate_table THEN NULL;
         WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ConversationReadState_conversationId_idx"
  ON "ConversationReadState" ("conversationId");

CREATE INDEX IF NOT EXISTS "ConversationReadState_actorType_actorId_idx"
  ON "ConversationReadState" ("actorType", "actorId");
