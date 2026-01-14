# Chat Image Attachments - Deployment Checklist

## 🚀 Pre-Deployment

- [ ] **Review Changes**: Check all modified files are correct
- [ ] **Read Documentation**: Review CHAT_IMAGE_ATTACHMENTS_SUMMARY.md
- [ ] **Backup Database**: Take database snapshot before migration

---

## 📋 Deployment Steps

### Step 1: Database Migration
Run the SQL migration on your production database:

```bash
# File location: apps/api/prisma/ADD_CHAT_ATTACHMENTS.sql
```

Execute these commands in your PostgreSQL database:

```sql
-- Add attachments column to all chat message tables
ALTER TABLE "ProjectChatMessage" ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "PrivateChatMessage" ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "AnonymousChatMessage" ADD COLUMN "attachments" JSONB DEFAULT '[]'::jsonb;

-- Add GIN indexes for better JSON query performance
CREATE INDEX "ProjectChatMessage_attachments_idx" ON "ProjectChatMessage" USING gin ("attachments");
CREATE INDEX "PrivateChatMessage_attachments_idx" ON "PrivateChatMessage" USING gin ("attachments");
CREATE INDEX "AnonymousChatMessage_attachments_idx" ON "AnonymousChatMessage" USING gin ("attachments");
```

**Verify Migration**:
```sql
-- Check columns exist
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name IN ('ProjectChatMessage', 'PrivateChatMessage', 'AnonymousChatMessage')
  AND column_name = 'attachments';

-- Should return 3 rows with JSONB type
```

- [ ] SQL migration executed successfully
- [ ] Columns verified in database

---

### Step 2: Update API

```bash
# Navigate to API directory
cd apps/api

# Regenerate Prisma client with new schema
pnpm exec prisma generate

# Verify no errors
```

- [ ] Prisma client regenerated
- [ ] No generation errors

---

### Step 3: Build & Deploy

```bash
# From project root
cd c:\Xampp_webserver\htdocs\renovation-platform

# Build everything
pnpm run build

# Check for build errors
```

- [ ] Frontend built successfully (web)
- [ ] Backend built successfully (api)
- [ ] No TypeScript errors

---

### Step 4: Environment Check

Verify these environment variables are set:

**Required for file uploads**:
- [ ] `STORAGE_ENDPOINT` - Cloudflare R2 endpoint
- [ ] `STORAGE_BUCKET` - R2 bucket name
- [ ] `STORAGE_ACCESS_KEY_ID` - R2 access key
- [ ] `STORAGE_SECRET_ACCESS_KEY` - R2 secret key
- [ ] `PUBLIC_ASSETS_BASE_URL` - CDN URL for accessing images

---

### Step 5: Deploy to Production

Deploy your application using your normal deployment process:

```bash
# Example commands (adjust for your setup)
git add .
git commit -m "feat: Add image attachments to chat system"
git push

# Deploy to production (your method)
```

- [ ] Code deployed to production
- [ ] Services restarted
- [ ] Application accessible

---

## ✅ Post-Deployment Testing

### Basic Functionality
- [ ] Navigate to a project with chat
- [ ] Click "Add images" button appears
- [ ] Select and upload a test image
- [ ] Image uploads successfully
- [ ] Image displays in chat
- [ ] Click image to open lightbox
- [ ] Lightbox shows full-size image

### ProjectChat Testing
- [ ] Client can upload images
- [ ] Professional can upload images
- [ ] Images visible to all participants
- [ ] Multiple images work (2-3)
- [ ] Text + images work together

### FOH Support Chat Testing
- [ ] Open support chat bubble
- [ ] Upload image as logged-in user
- [ ] Image uploads and displays
- [ ] Test as professional user
- [ ] Test as anonymous user (if applicable)

### Error Handling
- [ ] Try uploading oversized file (>10MB) - should show error
- [ ] Try uploading non-image file - should show error
- [ ] Try uploading 4+ images - should show error
- [ ] Test with slow connection - loading states work

### Mobile Testing
- [ ] Open on mobile device
- [ ] File picker works
- [ ] Images upload successfully
- [ ] Lightbox works on mobile
- [ ] Touch gestures work

---

## 🐛 Troubleshooting

### Images not uploading?
1. Check browser console for errors
2. Verify `/uploads` endpoint is accessible
3. Check Cloudflare R2 credentials
4. Verify CORS settings on R2 bucket

### Images not displaying?
1. Check `PUBLIC_ASSETS_BASE_URL` is correct
2. Verify R2 bucket has public read access
3. Check browser console for 404s
4. Inspect message object has `attachments` array

### Database errors?
1. Verify SQL migration ran successfully
2. Check column exists: `SELECT * FROM "ProjectChatMessage" LIMIT 1;`
3. Verify Prisma client was regenerated
4. Check Prisma schema matches database

### Build errors?
1. Clear build cache: `rm -rf .next node_modules/.cache`
2. Reinstall dependencies: `pnpm install`
3. Regenerate Prisma: `pnpm --filter api exec prisma generate`
4. Rebuild: `pnpm run build`

---

## 📊 Monitoring

After deployment, monitor:

- [ ] **Error Logs**: Check for any chat-related errors
- [ ] **Upload Endpoint**: Monitor `/uploads` success rate
- [ ] **Storage Usage**: Watch Cloudflare R2 storage metrics
- [ ] **User Feedback**: Ask users to test image uploads
- [ ] **Performance**: Check chat load times with images

---

## 🎯 Success Metrics

Within 24 hours:
- [ ] No critical errors in logs
- [ ] At least 5 successful image uploads
- [ ] No user complaints about broken features
- [ ] Images loading correctly across devices

Within 1 week:
- [ ] Regular usage of image attachments
- [ ] Positive user feedback
- [ ] No performance degradation
- [ ] Storage usage within expected limits

---

## 📞 Rollback Plan

If issues occur:

### Quick Rollback (Keep Database Changes)
```bash
# Revert code changes
git revert HEAD
git push

# Redeploy previous version
```

Database columns will remain but won't be used by old code.

### Full Rollback (Remove Database Changes)
```sql
-- Remove columns (data will be lost!)
ALTER TABLE "ProjectChatMessage" DROP COLUMN "attachments";
ALTER TABLE "PrivateChatMessage" DROP COLUMN "attachments";
ALTER TABLE "AnonymousChatMessage" DROP COLUMN "attachments";

-- Remove indexes
DROP INDEX IF EXISTS "ProjectChatMessage_attachments_idx";
DROP INDEX IF EXISTS "PrivateChatMessage_attachments_idx";
DROP INDEX IF EXISTS "AnonymousChatMessage_attachments_idx";
```

---

## ✅ Final Checklist

Before marking complete:
- [ ] All deployment steps completed
- [ ] All testing scenarios passed
- [ ] No errors in production logs
- [ ] Team notified of new feature
- [ ] Documentation updated
- [ ] Monitoring in place

---

**Deployment Date**: _____________  
**Deployed By**: _____________  
**Status**: ⬜ Complete ⬜ Issues Found ⬜ Rolled Back

**Notes**:
```
[Add any deployment notes, issues encountered, or observations here]
```
