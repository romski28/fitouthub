-- Remove the unique constraint on User.nickname
-- Nickname is now just a user self-reference, not a unique identifier

-- Find and drop the unique index on nickname
-- The exact index name depends on Prisma's naming convention
-- Try common patterns:

DROP INDEX IF EXISTS "User_nickname_key";
DROP INDEX IF EXISTS "User_nickname_unique";

-- If neither works, run this query to find the exact constraint name:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'User' AND indexdef LIKE '%nickname%';
