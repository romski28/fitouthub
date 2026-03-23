-- Migration: Add announcement ticker table for home-page public ticker text history.
-- Run this against your database manually.

CREATE TABLE IF NOT EXISTS "AnnouncementTicker" (
  "id" TEXT NOT NULL,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AnnouncementTicker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AnnouncementTicker_isActive_idx"
  ON "AnnouncementTicker" ("isActive");

CREATE INDEX IF NOT EXISTS "AnnouncementTicker_createdAt_idx"
  ON "AnnouncementTicker" ("createdAt");
