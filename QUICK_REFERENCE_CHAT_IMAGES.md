# Quick Reference - Chat Image Attachments

## 🎯 What Changed

**Feature**: Users can now share images in all chat types (ProjectChat, FOH Support)

**Key Points**:
- ✅ Up to 3 images per message
- ✅ 10MB max per image
- ✅ Uses existing Cloudflare R2 storage
- ✅ Works across all user types
- ✅ Mobile-friendly with lightbox view

---

## 📦 Files You Need

### 1. SQL Migration (REQUIRED)
**File**: `apps/api/prisma/ADD_CHAT_ATTACHMENTS.sql`

**Run this SQL on your database FIRST**:
```sql
ALTER TABLE "ProjectChatMessage" ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "PrivateChatMessage" ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "AnonymousChatMessage" ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;

CREATE INDEX "ProjectChatMessage_attachments_idx" ON "ProjectChatMessage" USING gin ("attachments");
CREATE INDEX "PrivateChatMessage_attachments_idx" ON "PrivateChatMessage" USING gin ("attachments");
CREATE INDEX "AnonymousChatMessage_attachments_idx" ON "AnonymousChatMessage" USING gin ("attachments");
```

### 2. After SQL, Run This
```bash
cd apps/api
pnpm exec prisma generate
cd ../..
pnpm run build
```

---

## 📄 Documentation Files

1. **CHAT_IMAGE_ATTACHMENTS_PLAN.md** - Full implementation plan
2. **CHAT_IMAGE_ATTACHMENTS_SUMMARY.md** - Complete feature documentation
3. **DEPLOYMENT_CHECKLIST_CHAT_IMAGES.md** - Step-by-step deployment guide
4. **QUICK_REFERENCE_CHAT_IMAGES.md** - This file

---

## 🔧 New Components

### Frontend (apps/web/src/components/):
- `chat-image-attachment.tsx` - Displays images with lightbox
- `chat-image-uploader.tsx` - Upload interface

### Modified Components:
- `project-chat.tsx` - Now supports images
- `floating-chat.tsx` - Now supports images

### Backend (apps/api/src/):
- `chat/chat.service.ts` - Handles attachments
- `chat/chat.controller.ts` - API endpoints updated
- `projects/projects.controller.ts` - Project chat updated

---

## 🎮 How Users Will Use It

1. **Upload**: Click "Add images" button in chat
2. **Preview**: See thumbnails of selected images
3. **Send**: Click "Upload X images" then "Send"
4. **View**: Click image thumbnail to see full-size

---

## 🐛 If Something Goes Wrong

### Upload Fails
Check: Cloudflare R2 environment variables
- `STORAGE_ENDPOINT`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`
- `PUBLIC_ASSETS_BASE_URL`

### Images Don't Display
Check: Database migration ran successfully
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'ProjectChatMessage' AND column_name = 'attachments';
```

### Build Errors
```bash
# Regenerate Prisma client
cd apps/api
pnpm exec prisma generate

# Clear cache and rebuild
pnpm run build
```

---

## ✅ Testing Quick Check

After deployment, test these:
1. ✅ Upload 1 image - works
2. ✅ Upload 2-3 images - works
3. ✅ Send text + images - works
4. ✅ Send images only - works
5. ✅ Click image - lightbox opens
6. ✅ Try >10MB file - shows error
7. ✅ Try non-image - shows error

---

## 📞 Need Help?

1. Check error logs in browser console
2. Check server logs for API errors
3. Review CHAT_IMAGE_ATTACHMENTS_SUMMARY.md for details
4. Check DEPLOYMENT_CHECKLIST_CHAT_IMAGES.md for troubleshooting

---

## 🎉 That's It!

**TL;DR**:
1. Run SQL migration
2. `pnpm exec prisma generate` in apps/api
3. `pnpm run build`
4. Deploy
5. Test uploads in chat

**Questions**: Check the summary doc for comprehensive info.

---

**Status**: ✅ Implementation Complete  
**Ready**: Yes, pending SQL migration  
**Breaking Changes**: None (fully backward compatible)
