-- Add PushSubscription table for PWA push notifications
-- Run against production DB after deploying API changes.

CREATE TABLE IF NOT EXISTS "PushSubscription" (
  "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"         TEXT,
  "professionalId" TEXT,
  "endpoint"       TEXT NOT NULL,
  "p256dh"         TEXT NOT NULL,
  "auth"           TEXT NOT NULL,
  "userAgent"      TEXT,
  "platform"       TEXT,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT NOW(),

  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PushSubscription_endpoint_key" UNIQUE ("endpoint"),
  CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "PushSubscription_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE
);

CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE INDEX "PushSubscription_professionalId_idx" ON "PushSubscription"("professionalId");
CREATE INDEX "PushSubscription_active_idx" ON "PushSubscription"("active");
CREATE INDEX "PushSubscription_platform_idx" ON "PushSubscription"("platform");
