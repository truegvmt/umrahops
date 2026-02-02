# UmrahOps Vercel Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying UmrahOps to Vercel with zero errors.

## Architecture
- **Frontend**: Vite + React (built to `dist/public`)
- **Backend**: Express.js (built to `dist/index.cjs`)
- **Deployment**: Vercel Serverless Functions
- **Database**: SQLite (local dev) → **Must migrate to PostgreSQL/Supabase for production**

## Pre-Deployment Checklist

### 1. Install Missing Dependencies
```bash
npm install
```

This ensures `@types/better-sqlite3` is installed (required for TypeScript compilation).

### 2. Test Build Locally
```bash
npm run build
```

**Expected Output:**
- `dist/public/` - Contains the Vite-built React app
- `dist/index.cjs` - Contains the bundled Express server

### 3. Verify Local Production Mode
```bash
npm start
```

Visit `http://localhost:5000` and ensure:
- Landing page loads
- Dashboard is accessible
- API endpoints respond (e.g., `/api/stats`)

## Vercel Deployment Steps

### Step 1: Push to GitHub
```bash
git add .
git commit -m "Vercel deployment configuration"
git push origin main
```

### Step 2: Import Project to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New Project"**
3. Import your GitHub repository: `truegvmt/umrahops`

### Step 3: Configure Build Settings
When prompted, configure as follows:

| Setting | Value |
|---------|-------|
| **Framework Preset** | **Other** (Do NOT select Vite) |
| **Build Command** | `npm run build` (auto-detected) |
| **Output Directory** | `dist/public` |
| **Install Command** | `npm install` (auto-detected) |
| **Node.js Version** | 18.x or 20.x |

### Step 4: Environment Variables
Add these in Vercel's Environment Variables section:

```
NODE_ENV=production
SQLITE_PATH=/tmp/umrahops.db
```

> **⚠️ IMPORTANT**: SQLite data is **ephemeral** on Vercel. For production, migrate to PostgreSQL or Supabase.

### Step 5: Deploy
Click **"Deploy"** and wait for the build to complete.

## Post-Deployment Verification

### 1. Check Build Logs
Ensure these steps complete successfully:
- ✅ `npm install` completes without errors
- ✅ `npm run build` runs successfully
- ✅ `dist/public/` and `dist/index.cjs` are created
- ✅ No TypeScript errors

### 2. Test Deployment
Visit your Vercel URL (e.g., `umrahops.vercel.app`) and verify:
- ✅ Landing page loads with correct styling
- ✅ "View Demo" button works
- ✅ Dashboard loads without errors
- ✅ Language toggle (English/Urdu) works
- ✅ API endpoints respond (check Network tab for `/api/stats`)

### 3. Check Function Logs
In Vercel Dashboard → Deployments → [Your Deployment] → Functions:
- Verify no `ERR_MODULE_NOT_FOUND` errors
- Check that requests are handled by `/api/serverless`

## Troubleshooting

### Error: "Cannot find module '/var/task/server/routes'"
**Cause**: Vercel is trying to run TypeScript source files instead of the built output.

**Solution**: 
- Ensure `vercel.json` exists with correct configuration
- Verify `api/serverless.js` wrapper exists
- Check that `npm run build` completes successfully

### Error: "Could not find a declaration file for module 'better-sqlite3'"
**Cause**: Missing TypeScript type definitions.

**Solution**:
```bash
npm install --save-dev @types/better-sqlite3
git add package.json package-lock.json
git commit -m "Add better-sqlite3 types"
git push
```

Then redeploy in Vercel.

### Blank Page or 500 Error
**Cause**: Static files not being served correctly.

**Solution**:
1. Check that `dist/public/index.html` exists after build
2. Verify `server/static.ts` resolves paths correctly
3. Ensure `vercel.json` routes all traffic to `/api/serverless`

### Database Not Persisting
**Expected Behavior**: SQLite on Vercel is temporary and resets on each deployment.

**Solution**: Migrate to a hosted database:
1. **Supabase** (Recommended):
   - Create a Supabase project
   - Update `server/db.ts` to use PostgreSQL
   - Add `DATABASE_URL` to Vercel environment variables

2. **Vercel Postgres**:
   - Enable Vercel Postgres in your project
   - Update schema to use PostgreSQL-compatible types

## File Structure Reference

```
umrahos-main/
├── api/
│   └── serverless.js          # Vercel function wrapper
├── client/                     # React frontend source
├── server/                     # Express backend source
├── dist/                       # Build output (gitignored)
│   ├── public/                 # Vite build
│   └── index.cjs               # Express build
├── vercel.json                 # Vercel configuration
├── package.json
└── script/build.ts             # Build script
```

## Production Recommendations

### 1. Database Migration
Replace SQLite with PostgreSQL:
- Use Supabase or Vercel Postgres
- Update Drizzle schema for PostgreSQL
- Migrate existing data

### 2. Environment Variables
Set these in Vercel:
```
NODE_ENV=production
DATABASE_URL=postgresql://...
SESSION_SECRET=<random-secret>
```

### 3. Custom Domain
1. Add your domain in Vercel → Settings → Domains
2. Update DNS records as instructed
3. SSL is automatic

### 4. Monitoring
- Enable Vercel Analytics
- Set up error tracking (Sentry, LogRocket)
- Monitor function execution times

## Support
If deployment fails after following this guide:
1. Check Vercel build logs for specific errors
2. Verify all files are committed to Git
3. Ensure `npm run build` works locally
4. Review function logs in Vercel dashboard

---

**Last Updated**: 2026-02-02
**Vercel CLI Version**: 50.9.6
**Node.js Version**: 20.19.5
