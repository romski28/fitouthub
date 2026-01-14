-- Add attachments field to chat message tables for image sharing
-- Images are stored in Cloudflare R2 and URLs stored in JSONB array
-- Format: [{"url": "https://...", "filename": "image.jpg"}, ...]

-- Add attachments to ProjectChatMessage
ALTER TABLE "ProjectChatMessage" 
ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;

-- Add attachments to PrivateChatMessage
ALTER TABLE "PrivateChatMessage" 
ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;

-- Add attachments to AnonymousChatMessage
ALTER TABLE "AnonymousChatMessage" 
ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;

-- Add index for querying messages with attachments
CREATE INDEX "ProjectChatMessage_attachments_idx" ON "ProjectChatMessage" 
USING gin ("attachments");

CREATE INDEX "PrivateChatMessage_attachments_idx" ON "PrivateChatMessage" 
USING gin ("attachments");

CREATE INDEX "AnonymousChatMessage_attachments_idx" ON "AnonymousChatMessage" 
USING gin ("attachments");

-- Example data format:
-- attachments: [
--   {"url": "https://cdn.example.com/image1.jpg", "filename": "receipt.jpg"},
--   {"url": "https://cdn.example.com/image2.jpg", "filename": "before.jpg"}
-- ]
