-- Add read tracking to ProjectChatMessage
ALTER TABLE "ProjectChatMessage"
  ADD COLUMN "readByClientAt" TIMESTAMP(3),
  ADD COLUMN "readByProAt" TIMESTAMP(3),
  ADD COLUMN "readByFohAt" TIMESTAMP(3);

-- Add read tracking to PrivateChatMessage
ALTER TABLE "PrivateChatMessage"
  ADD COLUMN "readByUserAt" TIMESTAMP(3),
  ADD COLUMN "readByProAt" TIMESTAMP(3);
