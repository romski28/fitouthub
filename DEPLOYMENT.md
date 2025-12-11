# 🚀 Fitout Hub - Deployment Guide

## Quick Deploy (5 minutes)

### 1. Deploy API to Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Connect your GitHub repository
3. Render will auto-detect `render.yaml`
4. Add environment variable:
   - **DATABASE_URL**: `your-supabase-connection-string`
5. Click "Create Web Service"
6. Copy your API URL (e.g., `https://fitouthub-api.onrender.com`)

### 2. Deploy Web to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (free)
2. Click "Import Project" → Connect your GitHub repo
3. Select `apps/web` as root directory
4. Add environment variable:
   - **NEXT_PUBLIC_API_BASE_URL**: `https://fitouthub-api.onrender.com` (from step 1)
5. Click "Deploy"
6. Your web app is live! (e.g., `https://fitouthub.vercel.app`)

### 3. Share with Team (Expo Mobile)

```bash
cd apps/mobile
pnpm install
pnpm start
```

Scan QR code with:
- **iOS**: Camera app → Opens in Expo Go
- **Android**: Expo Go app → Scan QR

---

## Cost Breakdown

- **Vercel**: FREE (Next.js hosting)
- **Render**: FREE (API with cold starts) or $7/month (always on)
- **Supabase**: FREE (500MB database)
- **Expo**: FREE (dev + team testing)

**Total MVP Cost: $0-7/month** ✅

---

## Environment Variables Checklist

### API (.env in apps/api)
```
DATABASE_URL="postgresql://..."
NODE_ENV="production"
```

### Web (.env.local in apps/web)
```
NEXT_PUBLIC_API_BASE_URL="https://your-api.onrender.com"
```

### Mobile (.env in apps/mobile)
```
EXPO_PUBLIC_API_URL="https://your-api.onrender.com"
```

---

## GitHub Setup (Required)

1. Initialize git: `git init`
2. Add files: `git add .`
3. Commit: `git commit -m "Initial commit - Fitout Hub MVP"`
4. Create GitHub repo and push:
   ```bash
   git remote add origin https://github.com/yourusername/fitouthub.git
   git push -u origin main
   ```

---

## Troubleshooting

**API not connecting?**
- Check DATABASE_URL is correct in Render
- Verify CORS settings in `apps/api/src/main.ts`

**Web build failing?**
- Ensure `NEXT_PUBLIC_API_BASE_URL` is set in Vercel

**Mobile can't fetch?**
- Update API URL in mobile app config
- Ensure API is publicly accessible

---

## Next Steps After Deploy

✅ Web app live for VC demos
✅ API accessible from anywhere
✅ Team can test mobile via Expo Go
✅ Ready for user testing

**Need help?** Check deployment logs in Vercel/Render dashboards
