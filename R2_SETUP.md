# Cloudflare R2 Setup Guide

## 1. Create R2 Bucket

1. Log into your Cloudflare account
2. Go to **R2** (left sidebar)
3. Click **Create bucket**
   - Name: `fitouthub-uploads` (or your choice)
   - Region: **Auto** (closest to your users)
   - Click **Create bucket**

## 2. Create API Token for R2

1. In Cloudflare, go to **Account settings** → **API tokens** (or **R2** → **Settings**)
2. Click **Create API token**
3. **Recommended:** Use the R2-specific template or create custom:
   - **Permissions:**
     - `s3:GetObject`
     - `s3:PutObject`
     - `s3:DeleteObject` (optional, for cleanup)
   - **Resources:** Select your bucket or all R2
   - **TTL:** 1 year or indefinite for production
4. Copy the credentials shown:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint URL** (format: `https://<account-id>.r2.cloudflarestorage.com`)

## 3. Set Environment Variables

### On Render (for API)
```
STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STORAGE_BUCKET=fitouthub-uploads
STORAGE_ACCESS_KEY_ID=<your-access-key>
STORAGE_SECRET_ACCESS_KEY=<your-secret-key>
PUBLIC_ASSETS_BASE_URL=https://cdn.fitouthub.com  # (or use your domain via Cloudflare)
```

### On Vercel (for Frontend)
```
NEXT_PUBLIC_API_BASE_URL=https://fitouthub.onrender.com/api
```

## 4. (Optional) Set Up Public URL via Cloudflare

If you want files accessible at a custom domain (e.g., `https://cdn.fitouthub.com`):

1. In Cloudflare **R2** → Your bucket → **Settings**
2. Under **Public access**, enable public access via a custom domain
3. Point a CNAME in your DNS to the R2 endpoint

**Simpler:** Use R2 public bucket URL directly:
```
PUBLIC_ASSETS_BASE_URL=https://<bucket>.r2.cloudflarestorage.com
```

## 5. Migrate Existing Files (Optional)

If you have images already uploaded to disk (`/uploads/`), run:
```bash
cd apps/api
pnpm migrate:uploads:r2
```

This script will:
- Read files from `uploads/` directory
- Upload each to R2
- Print URLs for verification

Then manually update project notes to use new R2 URLs, or the `toAbsolute()` function will accept both formats.

## 6. Deploy

Push changes and redeploy:
```bash
git add -A
git commit -m "integrate Cloudflare R2 storage"
git push
```

Render will auto-deploy the API; Vercel will auto-deploy the web app.

## Troubleshooting

- **Files not uploading:** Check `STORAGE_ENDPOINT`, credentials, and bucket name in Render env
- **404 on images:** Verify `PUBLIC_ASSETS_BASE_URL` is correct and publicly accessible
- **CORS issues:** If fronting R2 via Cloudflare Workers, add appropriate CORS headers

