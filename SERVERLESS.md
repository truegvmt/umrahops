# UmrahOps Supabase Edge Functions Deployment

**Last Updated**: 2026-02-03  
**Status**: Production-Ready  
**Platform**: Supabase Edge Functions (Deno)

---

## Architecture

```
Client (Browser)
     ↓
Supabase Edge Function: /functions/v1/api
     ↓
Direct API Handler (Deno + Supabase Client)
     ↓
Supabase PostgreSQL
```

**Key Principle**: Native Deno implementation. NO Express bundling hassle.

---

## Prerequisites

1. **Supabase CLI**:
   ```bash
   npm i -g supabase
   ```

2. **Login**:
   ```bash
   supabase login
   ```

3. **Link Project**:
   ```bash
   supabase link --project-ref dckcvjpbcbpixanakdns
   ```
   *(Use your actual project ref from Supabase dashboard URL)*

---

## Database Setup

Ensure these tables exist in your Supabase project:

```sql
-- Groups table
CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  "travelersCount" INTEGER DEFAULT 0,
  "visaIssued" INTEGER DEFAULT 0,
  "pendingIssues" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Travelers table
CREATE TABLE IF NOT EXISTS travelers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "groupId" UUID REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  passport TEXT,
  nationality TEXT,
  "riskScore" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entityType" TEXT,
  "entityId" TEXT,
  action TEXT,
  payload JSONB DEFAULT '{}',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Objectives table (for AI tasks)
CREATE TABLE IF NOT EXISTS objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT,
  status TEXT DEFAULT 'pending',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

Run these in **Supabase Dashboard → SQL Editor**.

---

## Deployment

**Single Command**:

```bash
supabase functions deploy api --no-verify-jwt
```

That's it. No build step needed - Deno handles everything.

---

## Environment Variables

Set in **Supabase Dashboard → Edge Functions → Configuration**:

```bash
# Automatically available:
SUPABASE_URL=<auto-injected>
SUPABASE_ANON_KEY=<auto-injected>

# Optional (if you need custom secrets):
SESSION_SECRET=your-secret-here
```

---

## API Endpoints

Your Edge Function handles:

### Core Endpoints
- `GET /api/health` - Health check
- `GET /api/stats` - Dashboard statistics

### Groups
- `GET /api/groups` - List all groups
- `POST /api/groups` - Create group
- `GET /api/groups/:id` - Get group by ID

### Travelers
- `GET /api/groups/:groupId/travelers` - List travelers
- `POST /api/groups/:groupId/travelers` - Create traveler
- `POST /api/groups/:groupId/travelers/bulk` - Bulk import

### Jobs
- `GET /api/jobs` - List jobs
- `POST /api/jobs` - Create job

### Audit
- `GET /api/audit` - List audit logs

### Supporting
- `GET /api/objectives` - AI objectives
- `GET /api/hotels` - Hotels list

---

## Frontend Configuration

Update your frontend API base URL:

**File**: `client/src/lib/queryClient.ts` (or wherever you initialize API calls)

```typescript
const API_URL = import.meta.env.PROD 
  ? 'https://dckcvjpbcbpixanakdns.supabase.co/functions/v1/api' 
  : '/api';
```

---

## Testing

```bash
# Test locally
supabase functions serve api

# Make a test request
curl http://localhost:54321/functions/v1/api/health
```

Expected:
```json
{"status":"ok","mode":"supabase-edge"}
```

---

## Deployment Verification

After deploying:

```bash
curl https://dckcvjpbcbpixanakdns.supabase.co/functions/v1/api/health
```

Should return:
```json
{"status":"ok","mode":"supabase-edge"}
```

---

## Logs

View real-time logs:

```bash
supabase functions logs api --follow
```

Or in **Supabase Dashboard → Edge Functions → Logs**.

---

## Troubleshooting

### "Module not found"
- **Cause**: Typo in import URL
- **Fix**: Verify import paths use `https://` for Deno modules

### "Database connection failed"
- **Cause**: Missing environment variables
- **Fix**: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are auto-injected by Supabase

### "CORS errors"
- **Cause**: Frontend not allowed
- **Fix**: Update `corsHeaders` in `index.ts` to match your domain (or keep `*` for dev)

### "401 Unauthorized"
- **Cause**: RLS policies blocking access
- **Fix**: Either disable RLS for MVP or set proper policies in Supabase dashboard

---

## Production Checklist

- [ ] Database tables created
- [ ] Edge function deployed: `supabase functions deploy api`
- [ ] Health check responds: `curl .../api/health`
- [ ] Frontend API URL updated
- [ ] CORS configured correctly
- [ ] RLS policies reviewed

---

## Scaling Notes

**Supabase Edge Functions:**
- Automatically scale 0 → millions
- Global deployment (low latency worldwide)
- No cold starts (Deno is fast)
- 10s timeout (extend via dashboard if needed)

This is it - **lean, production-ready, zero build complexity**.
