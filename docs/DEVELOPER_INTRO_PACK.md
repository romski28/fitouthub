# Mimo Platform — Developer Intro Pack

**Prepared:** August 2026
**Audience:** Incoming developer taking the platform from MVP to production (web + mobile)
**Tone:** Honest — "warts and all". This document deliberately calls out what is messy, half-built, or still pending, so you are not surprised later.

---

## 1. What this platform is

**Mimo** is a two-sided marketplace for **Hong Kong home renovation**. It connects **clients** (homeowners, landlords, property managers, estate agents) with **renovation professionals** (contractors, specialist companies, resellers). The platform takes a project from a conversational brief all the way through quoting, site inspection, contract signing, escrow-funded payments, work-in-progress reporting and completion.

The product was previously called **FitoutHub / FoH** and a rebrand to **Mimo** is **in progress** (see §9 — you will still find `fitouthub*` URLs, storage keys and UI strings).

**Key personas modelled in the system:**

| Persona | Role |
|---|---|
| Client | Posts projects, reviews quotes, funds escrow |
| Professional | Bids on projects, books site visits, does the work |
| Landlord / Property Manager / Estate Agent | Variants of the client role (create projects on behalf of owners) |
| Project Delegate | A third party invited to help manage a client's project |
| Surveyor / Survey ops | Survey questionnaires and site survey workspace |
| Admin / FOH | Back-office review, approvals, support (web only) |

**The long-term shape agreed so far:** the **web** is the full product including all admin/back-office work; the **mobile app** will replicate the *user-facing* flows (project tracking, chat, site visits, quotes) but **admin stays on the web**.

---

## 2. Current state — the honest version

### What is built and working end-to-end
The **SCALE_1 (single milestone) lifecycle runs cleanly**:

```
Client creates project (AI wizard or form)
  → professionals bid + submit quotes
  → client awards a pro
  → both sign the agreement
  → client funds escrow (Stripe checkout)
  → work starts (QR on-site check-in)
  → progress reports
  → milestone payment release
  → completion / warranty
```

Also working:

- **AI intake wizard** — DeepSeek-powered conversational project brief (one question per turn, tappable answers, safety/risk notes accumulation, image intake).
- **Trades & service matching** — keyword → profession routing (e.g. "leaky pipe" → plumber), DB-backed `Trade`/`ServiceMapping` with 5-min cache.
- **Site access / inspection** — request → approve/deny → visit scheduling → QR check-in → visit notes; supports hourly slots 08:00–18:00 HK time.
- **Chat** — multiple surfaces (floating support chat, project chat, admin messaging) with structured event cards and file attachments (R2).
- **Financial/escrow** — Stripe checkout, escrow deposit, advance payments, milestone releases, platform fee execution, running balance ledger.
- **Notifications** — email, WhatsApp/SMS (via Twilio), push subscriptions, announcement ticker.
- **Admin** — several panels (professionals, projects, users, trades, messaging, financials, questionnaires) — but see §9: it's a patchwork.
- **Questionnaires / survey** — questionnaire builder, survey workspace with markup.
- **RLS** — row-level security policies exist for public tables (phased rollout).
- **PWA** — installable on desktop/Android; iOS is **broken** (see §9).

### What is part-built / in transition

| Area | State |
|---|---|
| **Identity / Persona unification** | Two legacy account tables (`User`, `Professional`) + newer `Identity`/`Persona` layer. Migration is phased and **not complete** — the code still carries both paths. |
| **Rebrand FitoutHub → Mimo** | Three-phase plan written; partially executed. Legacy `foh_*` storage keys and `fitouthub*` URLs still present. |
| **Financial consolidation** | Legacy `PaymentRequest` table still coexists with `FinancialTransaction`; a consolidation plan exists but is not fully executed. |
| **Chat shared renderer** | Three chat surfaces duplicate message rendering. A PR-by-PR migration plan (PR1–PR5) exists but has not been executed. |
| **Admin command centre** | Spec written for one unified ops console; current admin area is a mix of old and new panels. |
| **Professional availability** | Calendar page shows only milestones; site-visit auto-blocking and HK public holidays are planned, not built. |
| **Mobile app** | Expo scaffold only (~44 files): tabs, themed components, API client. Not yet feature-complete. |
| **Retention (10% / 3-month warranty)** | Designed and deliberately deferred; behind a not-yet-enabled feature flag. |

### Known warts & open issues (read this twice)

1. **No Prisma migrations.** Schema changes are **manual SQL files** run in the Supabase SQL Editor. The Prisma schema is updated for type safety only. Discipline is essential — see §6.
2. **iOS Safari crash.** The home page's `SearchFlow` module graph crashes or hangs on iOS Safari (works on desktop/Android). Root cause not yet found. See `memories/repo/ios-debugging-findings.md`-equivalent notes in the repo memory files and §11.
3. **Dual auth systems.** Client auth and professional auth are separate services with separate tokens. Don't assume one token model.
4. **Duplication.** Chat rendering, next-step modals, and status chips have known duplicated implementations. This is the explicit reason the business wants a cleanup pass.
5. **Inconsistent styling.** A "Mimo Beige" theme exists but is not uniformly applied; some screens use older slate/white styling. Tailwind v4 with a custom theme.
6. **Passwords were plaintext at MVP.** bcrypt hashing has since been added to registration/login and a one-shot migration script exists (`apps/api/src/scripts/bcrypt-migrate-passwords.ts`). **Verify that script was actually run on production** before trusting auth.
7. **Caching is hand-rolled.** Next-step state is cached in a JSON column (`Project.nextStepCache`) plus localStorage/Map caches on the frontend. Polling (60s) + short TTLs are the "realtime" mechanism. No websockets/SSE yet.
8. **Dead code.** Some handlers/fields are unused (e.g. `handleSubmitQuote`, `handleAccept`, `handleReject` flagged in an earlier audit). Cleanup is expected.
9. **Test coverage is thin.** Vitest on web, Jest on API exist, but many flows rely on manual testing. Treat regressions as your responsibility.
10. **Docs are scattered.** There are ~60+ markdown/SQL files at the repo root. Some are authoritative, some are stale drafts. When in doubt, read the code.

---

## 3. Architecture at a glance

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (Frontend)                     │
│  Next.js 16 App Router · React 19 · Tailwind CSS v4      │
│  PWA (service worker) · next-intl (en, zh-HK)            │
└──────────────────────┬──────────────────────────────────┘
                       │ REST (JSON) — JWT in Authorization header
┌──────────────────────▼──────────────────────────────────┐
│                   Render (Backend)                       │
│  NestJS 11 · Prisma 6 (types only) · PostgreSQL          │
│  JWT + Google OAuth · DeepSeek AI · Qwen Vision          │
│  Stripe · Twilio · Resend · web-push · Cloudflare R2     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Supabase (PostgreSQL + RLS)                  │
│  Manual SQL migrations (no prisma migrate)                │
└─────────────────────────────────────────────────────────┘
```

### Monorepo layout

```
renovation-platform/
├── apps/
│   ├── web/            # Next.js frontend
│   ├── api/            # NestJS backend
│   └── mobile/         # Expo / React Native (scaffold)
├── packages/
│   └── schemas/        # shared constants (e.g. locations.ts)
├── package.json        # pnpm workspace root
├── pnpm-workspace.yaml
├── render.yaml         # Render service definition (API)
├── vercel.json         # Vercel build config (web)
├── docs/               # specs, plans, user manual
└── *.sql               # Manual DB migrations (dozens)
```

**Rough scale:** ~272 web source files, ~180 API source files, ~44 mobile files, **89 Prisma models** (~2,000 lines of schema).

---

## 4. Tech stack summary

| Layer | Technology |
|---|---|
| Language | TypeScript everywhere |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| State | React Context + hooks (no Redux); localStorage caches |
| i18n | next-intl (English, Traditional Chinese `zh-HK`) |
| Backend | NestJS 11 (modules, guards, DI) |
| ORM | Prisma 6 — **read-only type generation**, no migrations |
| Database | PostgreSQL via Supabase, with RLS |
| Auth | JWT (access + refresh), Google OAuth, OTP for pros, session tokens |
| AI | DeepSeek (chat/intake), Qwen (vision/image analysis) |
| Payments | Stripe (checkout for escrow) |
| Comms | Twilio (WhatsApp/SMS), Resend (email), web-push (notifications) |
| Storage | Cloudflare R2 (uploads) via AWS S3 SDK |
| Mobile | Expo ~54 / React Native 0.81, expo-router |
| Infra | Vercel (web), Render (api), Supabase (db) |
| Tooling | pnpm workspaces, Turbo, ESLint, Prettier, Jest + Vitest |

---

## 5. Key implementation patterns you must understand

### 5.1 The "Next Step" state machine (most important)
The backend computes, per project and per actor, **what the next action should be**:

- **Server:** `apps/api/src/projects/next-step.service.ts` — the single most complex file and source of most historical bugs. Result cached in `Project.nextStepCache` (JSON), keyed by `userId:role:stage`; recomputed on stage transitions.
- **Frontend:** `apps/web/src/lib/next-steps.ts` (Map cache, 30s TTL), `apps/web/src/components/next-steps/modal-dispatcher.tsx` (routes an `actionKey` to the correct modal).
- **Actions** include `SUBMIT_QUOTE`, `REQUEST_SITE_ACCESS`, `REVIEW_AGREEMENT`, `DEPOSIT_ESCROW`, `AUTHORIZE_MATERIALS_WALLET`, etc.

**Rule of thumb:** if a user "can't see the next button", 90% of the time it's a stale `nextStepCache` or a role-detection mismatch (historically `professionalId` vs `professional.userId`).

### 5.2 Project lifecycle
`ProjectStage` enum drives everything:

```
CREATED → BIDDING_ACTIVE → SITE_VISIT_* → QUOTE_RECEIVED → BIDDING_CLOSED
→ CONTRACT_PHASE → PRE_WORK → WORK_IN_PROGRESS → MILESTONE_PENDING
→ PAYMENT_RELEASED → NEAR_COMPLETION → FINAL_INSPECTION → COMPLETE
→ warranty_period → CLOSED
(+ exceptional states: PAUSED, DISPUTED)
```

Scale tiers: **SCALE_1** single milestone (fast path), **SCALE_2** two milestones, **SCALE_3** multiple milestones.

### 5.3 Manual SQL migration discipline
There are **no Prisma migrations**. The loop is:

1. Write a `MANUAL_SQL_*.sql` (or `apps/api/prisma/*.sql`) file with the `CREATE/ALTER TABLE`.
2. Run it in the **Supabase SQL Editor** (dev, then prod).
3. Update `apps/api/prisma/schema.prisma` to match (types only).
4. `pnpm exec prisma generate` in `apps/api`.
5. Redeploy the API (Render).

**Never** assume `prisma migrate deploy` on Render will handle schema — `render.yaml` runs it but the real source of truth is the manual SQL files.

### 5.4 Auth
- Client auth: `apps/api/src/auth/` — register, login, refresh, Google OAuth.
- Professional auth: `apps/api/src/professional-auth/` — OTP + Google OAuth.
- **Unification:** `Identity` (email, passwordHash, OTP, session token) + `Persona` (role → User/Professional/Landlord/PropertyManager/EstateAgent/ProjectDelegate) — this is the target model, but legacy tables still exist.

### 5.5 Chat & events
Messages can be plain text or **structured events** prefixed `[[event]]` (e.g. quote submitted, site visit scheduled). `apps/web/src/lib/chat-event-parser.ts` + `chat-event-card.tsx` render them. This logic is duplicated across `floating-chat.tsx`, `project-chat.tsx`, and admin messaging — the planned shared renderer fixes this.

### 5.6 Design system ("Mimo Beige")
- Card bg `#F5EEDE`, border `#D4C8A0`
- Coral accent `#FF7F50`, emerald primary button (`bg-emerald-600`)
- Body `text-stone-600/700`, charcoal `#4A3623`
- Modals use a flip-card pattern (`perspective:1600px`, `rotateY(180deg)`)

Not all screens conform yet — expect to normalize.

---

## 6. Running locally

```bash
# from repo root
pnpm install

# API (port 3001)
cd apps/api && pnpm start:dev

# Web (port 3000)
cd apps/web && pnpm dev

# Mobile (Expo)
cd apps/mobile && pnpm start
```

**Web needs** `apps/web/.env.local`:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
```

**API needs** `apps/api/.env`:
```
DATABASE_URL=postgresql://...          # pooler host, pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://...            # direct connection for schema ops
JWT_SECRET=...
JWT_REFRESH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_ID=...
DEEPSEEK_API_KEY=...
DEEPSEEK_MODEL=deepseek-v4-pro
QWEN_VISION_ENABLED=false
RESEND_API_KEY=...
TWILIO_* ...
STRIPE_* ...
R2_* ...
```

Useful API scripts (from `apps/api`):
- `pnpm run seed:professionals`, `seed:next-steps`, `seed:trades`
- `pnpm run set:default-passwords`
- `pnpm run migrate:uploads:r2`

---

## 7. Deployment (today's reality)

| Layer | Where | Trigger |
|---|---|---|
| Web | Vercel | Git push → auto-deploy (`apps/web/vercel.json`, `vercel.json`) |
| API | Render | Git push → auto-deploy (`render.yaml`) |
| Database | Supabase | **Manual** SQL in SQL Editor |
| Uploads | Cloudflare R2 | via API |

Current live identifiers still reference the old brand (e.g. `fitouthub.onrender.com`, `fitouthub.vercel.app`) until the rebrand completes.

**Git:** single `main` branch, remote `github.com/romski28/fitouthub.git`. Working tree is committed/pushed as of this writing.

---

## 8. Your first mandate (the brief)

The business wants you to, in order:

1. **Read and get familiar** — start with §10 below.
2. **Redeploy the repo into dev + prod environments** that are **shared across devices** so the CTO, dev, and stakeholders stay in sync:
   - Vercel: create a **team**, add **preview (dev)** + **production** projects, invite members.
   - Render: create **separate dev and prod API services** (or a blueprint) with distinct `DATABASE_URL` values.
   - Supabase: create **dev and prod database projects** (do not point both envs at one DB).
   - Standardise env vars and document them in one place.
3. **Create and upgrade the paid accounts** for the currently-free platforms (Vercel Pro, Render paid tier for no cold starts, Supabase Pro, Expo/EAS when mobile work begins) — the company will pay; you set them up.
4. **Streamline the organically-grown codebase** — unify CSS/JS, remove duplication (chat renderer first), normalise the theme, retire dead code.
5. **Then start the mobile app** — replicate user-facing flows, leave admin on the web.

**Suggested approach for step 4:** do it as safe, small PRs (the chat shared renderer plan already defines PR1–PR5 — follow it). Do not big-bang rewrite a state machine as load-bearing as `next-step.service.ts`.

---

## 9. Known debt / risk register (prioritised)

| # | Item | Severity | Suggested action |
|---|---|---|---|
| 1 | No automated DB migrations | High | Introduce a disciplined SQL-change process; consider a migration ledger |
| 2 | iOS Safari home page crash | High | Bisect `SearchFlow` imports to find the offending module |
| 3 | Dual auth (User/Professional vs Identity/Persona) | High | Finish phased migration on a dedicated window |
| 4 | Chat renderer duplication | Medium | Execute the existing PR1–PR5 plan |
| 5 | Admin panel patchwork | Medium | Build the single command centre per spec |
| 6 | Financial consolidation (PaymentRequest → FinancialTransaction) | Medium | Execute existing plan |
| 7 | Rebrand incomplete | Medium | Finish Phases 1–3 |
| 8 | Thin test coverage | Medium | Add tests around next-step + financials first |
| 9 | Hand-rolled caches/polling | Low–Med | Consider SSE/webhooks/websockets later |
| 10 | Scattered docs | Low | Consolidate into `docs/` as you go |

---

## 10. First 3 days — reading list (in order)

1. This document.
2. `PLATFORM_HANDOVER.md` — technical overview and mobile path.
3. `NEW_SESSION_PROMPT.md` — dense summary of architecture, design system, and key files (written as an AI session brief; still accurate).
4. `apps/api/prisma/schema.prisma` — skim all 89 models; learn the enums.
5. `apps/api/src/projects/next-step.service.ts` — the state machine.
6. `apps/web/src/components/next-steps/modal-dispatcher.tsx` — how actions become modals.
7. `apps/web/src/app/projects/[id]/` and `apps/web/src/app/professional-projects/[id]/` — the two primary detail surfaces.
8. `docs/CHAT_SHARED_COMPONENT_MIGRATION_PLAN.md` — your first refactor target.
9. `docs/ADMIN_COMMAND_CENTER_SPEC.md` — the admin end-state.
10. `DEPLOYMENT.md`, `render.yaml`, `vercel.json`, `apps/web/vercel.json` — before touching environments.
11. The repo memory folder (`/memories/repo/`) — captures decisions and hard-won lessons (site-access booking, bcrypt migration, iOS findings, retention policy, etc.).

**Before changing anything in production:** check whether the one-shot bcrypt migration script has actually been run, and take a database backup.

---

## 11. Handy grep targets

```bash
# Find every next-step action key
grep -rn "actionKey\|SUBMIT_QUOTE\|REQUEST_SITE_ACCESS" apps/api/src/projects apps/web/src/components/next-steps

# Find duplicated chat rendering (your cleanup targets)
grep -rln "senderLabel\|parseChatEvent" apps/web/src/components apps/web/src/app/admin/messaging

# Find legacy brand references (rebrand leftovers)
grep -rni "fitouthub\|foh_" apps/web/src apps/api/src --include=*.ts --include=*.tsx

# Find manual SQL migrations
ls MANUAL_SQL_*.sql apps/api/prisma/*.sql
```
