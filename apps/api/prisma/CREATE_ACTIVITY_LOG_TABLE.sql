-- Create ActivityLog table for tracking platform activity
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "ActivityLog" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" TEXT,
  "professionalId" TEXT,
  "actorName" TEXT NOT NULL,
  "actorType" TEXT NOT NULL, -- 'user', 'professional', 'admin', 'system'
  "action" TEXT NOT NULL, -- 'account_created', 'login', 'logout', 'profile_updated', etc.
  "resource" TEXT, -- e.g., 'User', 'Professional', 'Project', 'Quote'
  "resourceId" TEXT, -- ID of the affected resource
  "details" TEXT, -- Additional context or description
  "metadata" JSONB, -- Structured data (IP, user agent, etc.)
  "status" TEXT NOT NULL DEFAULT 'info', -- 'success', 'info', 'warning', 'danger'
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key constraints
ALTER TABLE "ActivityLog" 
  ADD CONSTRAINT "ActivityLog_userId_fkey" 
  FOREIGN KEY ("userId") 
  REFERENCES "User"("id") 
  ON DELETE SET NULL 
  ON UPDATE CASCADE;

ALTER TABLE "ActivityLog" 
  ADD CONSTRAINT "ActivityLog_professionalId_fkey" 
  FOREIGN KEY ("professionalId") 
  REFERENCES "Professional"("id") 
  ON DELETE SET NULL 
  ON UPDATE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "ActivityLog_userId_idx" ON "ActivityLog"("userId");
CREATE INDEX IF NOT EXISTS "ActivityLog_professionalId_idx" ON "ActivityLog"("professionalId");
CREATE INDEX IF NOT EXISTS "ActivityLog_action_idx" ON "ActivityLog"("action");
CREATE INDEX IF NOT EXISTS "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ActivityLog_actorType_idx" ON "ActivityLog"("actorType");
CREATE INDEX IF NOT EXISTS "ActivityLog_status_idx" ON "ActivityLog"("status");

-- Common action types for reference:
-- Authentication: 'account_created', 'login', 'logout', 'login_failed', 'password_changed'
-- Profile: 'profile_updated', 'profile_created', 'profile_deleted'
-- Projects: 'project_created', 'project_updated', 'project_deleted', 'project_completed'
-- Financial: 'quote_submitted', 'quote_approved', 'payment_requested', 'payment_released', 'escrow_confirmed'
-- Admin: 'user_suspended', 'user_approved', 'bulk_action', 'data_exported'
-- System: 'migration_run', 'backup_created', 'email_sent'
