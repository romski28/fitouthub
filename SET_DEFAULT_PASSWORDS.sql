-- SQL script to set default passwords for professionals
-- Password: "password"
-- Hash: $2b$10$UVlW1ue3xj.v9BzBnLHfOuKG/LOjqm0DxQfR7yqC6hQJ/2qfh3D5i
--
-- To use this:
-- 1. Go to Supabase Dashboard
-- 2. Click on "SQL Editor"
-- 3. Paste this script and run it
-- 4. All professionals without passwords will be able to login with password: "password"

UPDATE "Professional"
SET "passwordHash" = '$2b$10$UVlW1ue3xj.v9BzBnLHfOuKG/LOjqm0DxQfR7yqC6hQJ/2qfh3D5i'
WHERE "passwordHash" IS NULL;

-- Verify the update
SELECT email, "fullName", "businessName", "passwordHash" 
FROM "Professional" 
WHERE "passwordHash" IS NOT NULL
LIMIT 10;
