-- SQL script to resolve the failed Prisma migration
-- Run this in Supabase SQL Editor to mark the migration as resolved

-- STEP 1: Check if the passwordHash column exists
SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Professional' 
    AND column_name = 'passwordHash'
) as column_exists;

-- STEP 2: If column doesn't exist, add it
-- Uncomment and run if needed:
-- ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- STEP 3: Mark the migration as resolved in _prisma_migrations table
-- This tells Prisma that the migration was completed
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
    '20251223000000_add_password_hash_to_professional',
    '5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f',
    NOW(),
    '20251223000000_add_password_hash_to_professional',
    '',
    NULL,
    NOW(),
    1
)
ON CONFLICT (id) DO UPDATE SET finished_at = NOW(), rolled_back_at = NULL;

-- STEP 4: Verify the migration is now marked as completed
SELECT * FROM "_prisma_migrations" WHERE migration_name = '20251223000000_add_password_hash_to_professional';
