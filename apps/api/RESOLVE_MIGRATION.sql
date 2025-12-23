-- SQL script to resolve the failed Prisma migration
-- Run this in Supabase SQL Editor to mark the migration as resolved

-- STEP 1: Check if the passwordHash column exists
SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Professional' 
    AND column_name = 'passwordHash'
) as column_exists;

-- STEP 2: Add the passwordHash column if it doesn't exist
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- STEP 3: Delete the failed migration record so Prisma can try again
DELETE FROM "_prisma_migrations" 
WHERE migration_name LIKE '%add_password_hash_to_professional%';

-- STEP 4: Verify the migration record was deleted
SELECT * FROM "_prisma_migrations" 
WHERE migration_name LIKE '%add_password_hash_to_professional%';
