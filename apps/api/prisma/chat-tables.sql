-- ============================================================
-- Chat System Tables for Fitout Hub
-- Run these SQL statements in your Render PostgreSQL database
-- ============================================================

-- 1. Private Chat Threads (FOH Support for logged-in users/professionals)
CREATE TABLE "PrivateChatThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "professionalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateChatThread_pkey" PRIMARY KEY ("id")
);

-- 2. Private Chat Messages
CREATE TABLE "PrivateChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderUserId" TEXT,
    "senderProId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readByFohAt" TIMESTAMP(3),

    CONSTRAINT "PrivateChatMessage_pkey" PRIMARY KEY ("id")
);

-- 3. Anonymous Chat Threads (FOH Support for anonymous users)
CREATE TABLE "AnonymousChatThread" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnonymousChatThread_pkey" PRIMARY KEY ("id")
);

-- 4. Anonymous Chat Messages
CREATE TABLE "AnonymousChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnonymousChatMessage_pkey" PRIMARY KEY ("id")
);

-- 5. Project Chat Threads (Post-award team chat)
CREATE TABLE "ProjectChatThread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChatThread_pkey" PRIMARY KEY ("id")
);

-- 6. Project Chat Messages
CREATE TABLE "ProjectChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderUserId" TEXT,
    "senderProId" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectChatMessage_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================

CREATE UNIQUE INDEX "PrivateChatThread_userId_key" ON "PrivateChatThread"("userId");
CREATE UNIQUE INDEX "PrivateChatThread_professionalId_key" ON "PrivateChatThread"("professionalId");
CREATE UNIQUE INDEX "AnonymousChatThread_sessionId_key" ON "AnonymousChatThread"("sessionId");
CREATE UNIQUE INDEX "ProjectChatThread_projectId_key" ON "ProjectChatThread"("projectId");

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

-- PrivateChatThread indexes
CREATE INDEX "PrivateChatThread_userId_idx" ON "PrivateChatThread"("userId");
CREATE INDEX "PrivateChatThread_professionalId_idx" ON "PrivateChatThread"("professionalId");
CREATE INDEX "PrivateChatThread_updatedAt_idx" ON "PrivateChatThread"("updatedAt");

-- PrivateChatMessage indexes
CREATE INDEX "PrivateChatMessage_threadId_idx" ON "PrivateChatMessage"("threadId");
CREATE INDEX "PrivateChatMessage_senderType_idx" ON "PrivateChatMessage"("senderType");
CREATE INDEX "PrivateChatMessage_createdAt_idx" ON "PrivateChatMessage"("createdAt");

-- AnonymousChatThread indexes
CREATE INDEX "AnonymousChatThread_createdAt_idx" ON "AnonymousChatThread"("createdAt");

-- AnonymousChatMessage indexes
CREATE INDEX "AnonymousChatMessage_threadId_idx" ON "AnonymousChatMessage"("threadId");
CREATE INDEX "AnonymousChatMessage_createdAt_idx" ON "AnonymousChatMessage"("createdAt");

-- ProjectChatThread indexes
CREATE INDEX "ProjectChatThread_projectId_idx" ON "ProjectChatThread"("projectId");
CREATE INDEX "ProjectChatThread_updatedAt_idx" ON "ProjectChatThread"("updatedAt");

-- ProjectChatMessage indexes
CREATE INDEX "ProjectChatMessage_threadId_idx" ON "ProjectChatMessage"("threadId");
CREATE INDEX "ProjectChatMessage_senderType_idx" ON "ProjectChatMessage"("senderType");
CREATE INDEX "ProjectChatMessage_createdAt_idx" ON "ProjectChatMessage"("createdAt");

-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================

-- PrivateChatThread foreign keys
ALTER TABLE "PrivateChatThread" ADD CONSTRAINT "PrivateChatThread_userId_fkey" 
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrivateChatThread" ADD CONSTRAINT "PrivateChatThread_professionalId_fkey" 
    FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PrivateChatMessage foreign keys
ALTER TABLE "PrivateChatMessage" ADD CONSTRAINT "PrivateChatMessage_threadId_fkey" 
    FOREIGN KEY ("threadId") REFERENCES "PrivateChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrivateChatMessage" ADD CONSTRAINT "PrivateChatMessage_senderUserId_fkey" 
    FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PrivateChatMessage" ADD CONSTRAINT "PrivateChatMessage_senderProId_fkey" 
    FOREIGN KEY ("senderProId") REFERENCES "Professional"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AnonymousChatMessage foreign keys
ALTER TABLE "AnonymousChatMessage" ADD CONSTRAINT "AnonymousChatMessage_threadId_fkey" 
    FOREIGN KEY ("threadId") REFERENCES "AnonymousChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ProjectChatThread foreign keys
ALTER TABLE "ProjectChatThread" ADD CONSTRAINT "ProjectChatThread_projectId_fkey" 
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ProjectChatMessage foreign keys
ALTER TABLE "ProjectChatMessage" ADD CONSTRAINT "ProjectChatMessage_threadId_fkey" 
    FOREIGN KEY ("threadId") REFERENCES "ProjectChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- VERIFICATION QUERIES (Run these to verify tables were created)
-- ============================================================

-- Check if all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'PrivateChatThread',
    'PrivateChatMessage',
    'AnonymousChatThread',
    'AnonymousChatMessage',
    'ProjectChatThread',
    'ProjectChatMessage'
  )
ORDER BY table_name;

-- Check row counts (should all be 0 initially)
SELECT 
  'PrivateChatThread' as table_name, COUNT(*) as row_count FROM "PrivateChatThread"
UNION ALL
SELECT 'PrivateChatMessage', COUNT(*) FROM "PrivateChatMessage"
UNION ALL
SELECT 'AnonymousChatThread', COUNT(*) FROM "AnonymousChatThread"
UNION ALL
SELECT 'AnonymousChatMessage', COUNT(*) FROM "AnonymousChatMessage"
UNION ALL
SELECT 'ProjectChatThread', COUNT(*) FROM "ProjectChatThread"
UNION ALL
SELECT 'ProjectChatMessage', COUNT(*) FROM "ProjectChatMessage";
