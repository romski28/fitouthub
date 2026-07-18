-- Add APP_NOTIFICATIONS to the NotificationChannel enum
-- Run this against the Supabase PostgreSQL database

ALTER TYPE "NotificationChannel" ADD VALUE 'APP_NOTIFICATIONS';
