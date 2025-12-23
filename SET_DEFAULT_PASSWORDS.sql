-- SQL script to set default passwords for professionals
-- Password: "password"
-- Hash: $2b$10$MEF.3I6GeAKPDmM4uqTCbeC4Gu7RZqjdP94e/p63wI5PhPv4wsKoi
--
-- To use this:
-- 1. Go to Supabase Dashboard
-- 2. Click on "SQL Editor"
-- 3. Paste this script and run it
-- 4. All professionals without passwords will be able to login with password: "password"

-- STEP 1: Add the passwordHash column if it doesn't exist
ALTER TABLE "Professional" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- STEP 2: Set default passwords for all professionals
UPDATE "Professional"
SET "passwordHash" = '$2b$10$MEF.3I6GeAKPDmM4uqTCbeC4Gu7RZqjdP94e/p63wI5PhPv4wsKoi'
WHERE "passwordHash" IS NULL OR "passwordHash" = '$2b$10$UVlW1ue3xj.v9BzBnLHfOuKG/LOjqm0DxQfR7yqC6hQJ/2qfh3D5i';

-- STEP 3: Verify the update
SELECT email, "fullName", "businessName", 
       CASE WHEN "passwordHash" IS NOT NULL THEN 'Has Password' ELSE 'No Password' END as password_status
FROM "Professional" 
LIMIT 10;
