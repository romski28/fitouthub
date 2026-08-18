# Mimo Platform — Operations Runbook

**Prepared:** August 2026
**Audience:** the developer (and CTO) running day-to-day operations
**Companion docs:** `DEVELOPER_INTRO_PACK.md` (orientation), `NEW_DEV_FIRST_TWO_WEEKS.md` (first tasks), `DEPLOYMENT.md` (original deploy guide)

> This is the **how-to** document. It tells you *how to do things*, step by step.
> The intro pack tells you *what things are and why*. Read that first, then use this when you're doing the work.
>
> ⚠️ Values in `<angle brackets>` are placeholders — fill them in with the real values when you first run this, then keep this document up to date. A runbook that's out of date is worse than no runbook.

---

## 1. Quick reference

| Thing | Where | Notes |
|---|---|---|
| Repo | `github.com/romski28/fitouthub.git` | branch `main` |
| Web (frontend) | Vercel | auto-deploys on push |
| API (backend) | Render | auto-deploys on push |
| Database | Supabase (PostgreSQL) | **manual** SQL changes |
| Uploads/storage | Cloudflare R2 | via API |
| Dev web URL | `<dev web URL>` | fill in |
| Prod web URL | `<prod web URL>` | fill in (may still be `fitouthub.vercel.app`) |
| Dev API URL | `<dev API URL>` | fill in |
| Prod API URL | `<prod API URL>` | fill in (may still be `fitouthub.onrender.com`) |
| Dev DB | Supabase project **dev** | `<dev DB name>` |
| Prod DB | Supabase project **prod** | `<prod DB name>` |

**Ports (local):** web `3000`, API `3001`.

---

## 2. First run (from a clean machine)

```bash
# 1. Clone
git clone https://github.com/romski28/fitouthub.git
cd fitouthub  # or the local folder name renovation-platform

# 2. Install (pnpm 10)
pnpm install

# 3. Configure the API
cd apps/api
cp .env.example .env   # if a template exists; otherwise create .env from section 3
#    → fill in DATABASE_URL, DIRECT_URL, JWT secrets, etc. (see §3)

# 4. Generate the Prisma client (needed after every schema change too)
pnpm exec prisma generate

# 5. Start the API (port 3001)
pnpm start:dev

# 6. In a second terminal, configure + start the web app
cd apps/web
#    create .env.local from section 3
pnpm dev

# 7. Web is now at http://localhost:3000, API at http://localhost:3001
```

**Sanity check:** open `http://localhost:3000`, register a client account, then a professional account. If auth works and project creation works, your environment is healthy.

---

## 3. Environment variables (single source of truth)

Keep **one** table (this one) as the reference. Secrets live in the platform secret stores (Vercel/Render), **never** committed to git.

### Web (`apps/web/.env.local` locally; Vercel env vars in prod)

| Var | Dev value | Prod value |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | `<prod API URL>/api` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `<same>` | `<same>` |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `<same>` | `<same>` |

### API (`apps/api/.env` locally; Render env vars in prod)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Supabase pooled connection (`pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | Supabase direct connection (for schema/backfill scripts) |
| `JWT_SECRET` | access-token signing |
| `JWT_REFRESH_SECRET` | refresh-token signing |
| `GOOGLE_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_MODEL` | AI chat/intake (`deepseek-v4-pro`) |
| `QWEN_VISION_ENABLED` | vision toggle (`false` by default) |
| `RESEND_API_KEY` | email |
| `TWILIO_*` | WhatsApp/SMS |
| `STRIPE_*` | escrow checkout |
| `R2_*` | Cloudflare R2 uploads |

> **Rule:** dev and prod use **different databases**. Never point dev at the prod `DATABASE_URL`.

---

## 4. How to deploy

### 4.1 Web (Vercel) — automatic
1. Push to `main`.
2. Vercel auto-deploys. Check the Vercel dashboard → Deployments.
3. Preview deployments are created for PRs (dev); `main` → production.

**Config files:** `vercel.json` (root) and `apps/web/vercel.json`.

### 4.2 API (Render) — automatic
1. Push to `main`.
2. Render auto-deploys. Check the Render dashboard → Events/Logs.

**Config file:** `render.yaml` (build: `pnpm install --frozen-lockfile && pnpm run build`; start: `prisma migrate deploy && node dist/src/main.js`).

> **Note:** `prisma migrate deploy` in the start command does **not** manage schema changes — our schema changes are manual SQL (see §5). Do not rely on it for new tables.

### 4.3 Database (Supabase) — MANUAL
No push-triggered migration. See §5.

---

## 5. Database change procedure (the manual SQL loop)

**This is the most important procedure in this runbook. There are no Prisma migrations.**

1. **Write the SQL** — a new `MANUAL_SQL_<name>.sql` at repo root (or in `apps/api/prisma/`).
2. **Apply to dev DB first** — Supabase → SQL Editor → paste and run.
3. **Verify** the change in dev (query the table/columns, run the app).
4. **Apply to prod DB** — Supabase (prod project) → SQL Editor → paste and run.
   - ⚠️ Take a backup first (§6).
   - ⚠️ Get CTO sign-off for any prod schema change.
5. **Update `apps/api/prisma/schema.prisma`** to match (types only).
6. **Regenerate the Prisma client:** `cd apps/api && pnpm exec prisma generate`.
7. **Redeploy the API** (push, or Render manual deploy) so the new types are live.
8. **Record it** in the migration ledger (see below).

**Migration ledger** (create it if it doesn't exist — a simple table or `docs/MIGRATION_LEDGER.md`):

| SQL file | Dev applied? | Prod applied? | Date | Who |
|---|---|---|---|---|
| `MANUAL_SQL_ADD_...sql` | ✅ / ❌ | ✅ / ❌ | | |

**Rules:**
- Make scripts **idempotent** (safe to re-run: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$ ... IF NOT EXISTS`).
- Have a **rollback** script for anything non-trivial (or write the reverse SQL before you run).
- Order matters when a change depends on an earlier one — check the ledger first.

---

## 6. Backup & restore

### 6.1 Manual backup (do before any prod change)
1. Supabase → Prod project → Database → Backups.
2. Or via SQL: `pg_dump` against `DIRECT_URL` (see §7).

### 6.2 Restore
1. Supabase → Database → Backups → select backup → Restore (creates a restore to a point in time; does not overwrite live).
2. For critical data, restore into a **separate** project and compare before touching prod.

> At minimum: **back up prod before every schema change and before running any data-migration script.**

---

## 7. Useful commands

```bash
# API (apps/api)
pnpm start:dev                     # run locally (port 3001)
pnpm run build                     # production build (runs prisma generate first)
pnpm exec prisma generate          # regenerate Prisma client after schema.prisma change
pnpm run seed:professionals        # seed pros
pnpm run seed:next-steps           # seed next-step config
pnpm run seed:trades               # seed trades + service mappings
pnpm run set:default-passwords     # set known dev passwords
pnpm run migrate:uploads:r2        # migrate uploads to Cloudflare R2

# Web (apps/web)
pnpm dev                           # run locally (port 3000)
pnpm run build                     # production build
pnpm run lint                      # eslint
pnpm test                          # vitest

# One-off / diagnostic scripts (repo root)
node check-api-health.js
node check_support_request.js
```

---

## 8. Common issues & fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| API can't connect to DB | wrong `DATABASE_URL` / pooler not used | use pooled host, port `5432`, `pgbouncer=true&connection_limit=1` |
| Web can't reach API | wrong `NEXT_PUBLIC_API_BASE_URL` or CORS | check env var; check CORS in `apps/api/src/main.ts` |
| Render cold start (slow first call) | free tier | upgrade Render tier (planned) |
| "Next step" button missing / stale | stale `nextStepCache` | run `FLUSH_NEXTSTEP_CACHE.sql`; check `next-step.service.ts` |
| Type errors after schema change | forgot `prisma generate` | `cd apps/api && pnpm exec prisma generate` |
| iOS Safari home page blank/hangs | **known open bug** (SearchFlow module) | see `DEVELOPER_INTRO_PACK.md` §2/§9; bisect imports |
| Login fails after auth change | plaintext vs bcrypt mismatch | verify `bcrypt-migrate-passwords.ts` has been run (see §9) |
| New table not recognised | SQL applied to wrong project | check the ledger; confirm which Supabase project you edited |

---

## 9. Production safety checklist (run before any risky change)

- [ ] Backup taken (§6).
- [ ] CTO sign-off for prod schema/data changes.
- [ ] Change applied to **dev** and verified first.
- [ ] Rollback script ready.
- [ ] Migration ledger updated.
- [ ] `prisma generate` run (if schema changed).
- [ ] API redeployed (if code changed).

**Standing verification tasks:**
- [ ] Confirm the one-shot bcrypt migration actually ran on prod (`Identity.passwordHash` should be bcrypt hashes, not plaintext).
- [ ] Confirm prod and dev use separate databases.

---

## 10. Access & accounts

| Service | Account/team | Who has access |
|---|---|---|
| GitHub | `<org or account>` | CTO, dev |
| Vercel | `<team>` | CTO, dev |
| Render | `<workspace>` | CTO, dev |
| Supabase | `<org>` (dev + prod projects) | CTO, dev |
| Cloudflare R2 | `<account>` | CTO, dev |
| Stripe / Twilio / Resend / DeepSeek / Qwen | API keys in platform secret stores | CTO, dev |

> Onboarding a new device/person = add them to the Vercel team, Render workspace, Supabase org, and GitHub — then share the env-var reference (§3) and this runbook.

---

## 11. Daily / weekly operational checks

**Weekly (10 min):**
- [ ] Vercel + Render deploys green.
- [ ] Supabase project health (no failed jobs, backup succeeded).
- [ ] No unexpected errors in Render logs.
- [ ] AI cost/usage glance (DeepSeek/Qwen) if billing is visible.

**Monthly (30 min):**
- [ ] Review the migration ledger for anything applied but not recorded.
- [ ] Update this runbook with any new procedures or changed URLs.
