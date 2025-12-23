-- This migration sets default hashed passwords for all professionals without passwords
-- Password: "password" 
-- Hashed with bcrypt at cost factor 10

BEGIN;

-- Hash of "password" with bcrypt cost 10
-- Generated with: bcrypt.hash("password", 10)
-- Result: $2b$10$UVlW1ue3xj.v9BzBnLHfOuKG/LOjqm0DxQfR7yqC6hQJ/2qfh3D5i
-- This is a bcrypt hash that will work with the bcrypt.compare() function

UPDATE "Professional"
SET "passwordHash" = '$2b$10$UVlW1ue3xj.v9BzBnLHfOuKG/LOjqm0DxQfR7yqC6hQJ/2qfh3D5i'
WHERE "passwordHash" IS NULL;

COMMIT;
