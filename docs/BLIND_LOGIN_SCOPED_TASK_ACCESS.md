# Blind login — scoped task access via magic link / QR

**Status:** Design discussion (no code written yet)
**Date:** 2026-08-20
**Related:** `RUNBOOK.md` §5 (manual SQL loop), `auth/magic-link.controller.ts`, `projects.service.ts` (`generateSiteStartToken`), `project-delegate/page.tsx`

---

## 1. The ask

> Can we have a "blind login" that opens the platform directly onto **one project and one task** — for example, scanning a pro's QR code for a site inspection — via a URL containing a hashed ID, without a full account login?

Example: a helper/delegate (or a family member) on site scans the pro's QR and lands straight on that one site-inspection screen, checks in / records notes, and can't reach anything else.

**Answer:** Yes — feasible and low-risk, because every moving part already has a working precedent in the codebase (see §2).

---

## 2. What already exists

### 2.1 Magic link — "token URL → full login" (the hashed-ID pattern)
- `GET /api/auth/magic-link?token=<opaque>` in `apps/api/src/auth/magic-link.controller.ts`.
- Token = random opaque `EmailToken` row (action `auth`, `expiresAt`, `projectId`, `professionalId`), validated server-side.
- On success it auto-accepts the project (via `getAcceptTokenForMagicLink` + `respondToInvitation`) and signs a **30-day professional JWT**.
- Redirects to `/professional-magic?token=<jwt>&professional=<b64>&projectId=...` which stores full professional auth in `localStorage` and lands in the pro's project list.

**Gap:** it grants the *whole account*, not a single project + task.

### 2.2 QR site-start / site-inspection — scoped task token (but not a login)
- `generateSiteStartToken()` signs a **15-minute** JWT encoding `{ projectId, generatedByUserId, purpose: 'site_start' | 'site_inspection' }`, plus a 6-digit OTP for manual entry.
- Client scans it → `confirmSiteStart` / `confirmSiteInspection` verify the token/OTP and pin it to `projectId`.
- **Gap:** the scanner must already be authenticated — `project.userId === clientUserId` is enforced. The QR is *proof of presence*, not a *login*.

### 2.3 Delegation is already anticipated
- `project_delegate` role exists, with a placeholder `project-delegate/page.tsx` ("scan QR codes for site inspections … on their behalf").

---

## 3. Design (recommended)

A **scoped capability token** that does both halves at once: minimal authentication + pinned scope.

### 3.1 Storage — opaque, server-revocable (NOT a bare JWT in the URL)
New table `ScopedAccessToken` (or extend `EmailToken` with new actions):

| Column | Notes |
|---|---|
| `tokenHash` | SHA-256 of a 256-bit random token (only the hash is stored) |
| `projectId` | scope |
| `task` | e.g. `site_inspection`, `confirm_visit` |
| `professionalId` / `siteAccessRequestId` | optional, tighter scope |
| `expiresAt` | ~15 min for a live QR, 24–72 h for a scheduled inspection |
| `usedAt`, `revokedAt` | single-use / revoke |
| `createdById`, `consumedById` | audit |

Why hashed + DB rather than a signed JWT:
- single-use burn, immediate revocation,
- no secrets logged in URLs / browser history,
- payload can't be tampered with.

### 3.2 Minting
Endpoint the pro hits to generate a task link/QR — mirrors `generateSiteStartToken`. Returns an opaque token (and optional 6-digit OTP for manual entry).

### 3.3 Exchange + bridge page
New `/task-access` route (clone of `professional-magic`):
1. reads `?token=` from the query,
2. calls an exchange endpoint → returns a **short-lived scoped JWT** (`{ scope: { projectId, task } }`, `exp` 1–4 h, **no refresh token**),
3. stores only that scoped token (session memory, not persistent `localStorage`),
4. routes straight to the single-task screen.

### 3.4 Guard — `TaskTokenGuard`
Alongside the unified JWT strategy (`auth/jwt.strategy.ts`):
- rejects any request whose `projectId` isn't the token's `projectId`,
- allow-lists only the task's endpoints (e.g. scoped `GET /projects/:id` + `confirm-visit`); everything else 403.

### 3.5 Scoped reads
Minimal task-only project payload (address, inspection status, notes) — never the full project object.

---

## 4. Security notes

- **Bearer secret in a URL:** a QR is inherently a URL — treat it like a password. Prefer opaque tokens over JWTs.
- **Short expiry + single-use** — burn on first successful exchange.
- **Pin scope server-side** — never trust a `projectId` query param; derive it from the token row.
- **No refresh / no persistent session.**
- **Rate-limit** the exchange endpoint; keep brute-force protection on the 6-digit OTP.
- **Audit** minted-by / consumed-by / timestamps (reuses existing activity-logging discipline).
- The existing QR flow's biggest gap is precisely this: today the scanner must be the logged-in project owner. Blind login fixes "someone else on site does the check-in."

---

## 5. Effort estimate

| Piece | Work |
|---|---|
| `ScopedAccessToken` model + SQL + `prisma generate` | small |
| Mint endpoint (reuse `generateSiteStartToken`) | small |
| Exchange endpoint (token → scoped JWT) | small |
| `TaskTokenGuard` + scoped controller routes | medium |
| `/task-access` bridge page | small |
| Single-task UI (reuse `inspect-site-modal`) | medium |
| Audit + rate-limiting | small |

---

## 6. Open questions / decisions needed

- [ ] Which tasks first? (`site_inspection` confirm + notes is the obvious v1.)
- [ ] Who can mint tokens — awarded pro only, or client too?
- [ ] Expiry policy: fixed window vs. "valid for this scheduled visit only"?
- [ ] Single-use vs. re-usable-within-window for the on-site helper?
- [ ] Does a delegate need any persisted identity (for audit/chat attribution), or fully anonymous?

---

## 7. Next steps when picked up

1. Write `MANUAL_SQL_ADD_SCOPED_ACCESS_TOKEN.sql` (idempotent, rollback prepared) → dev → prod (§5 of RUNBOOK).
2. Add model to `schema.prisma` + `prisma generate`.
3. Mint + exchange endpoints in the projects/auth module.
4. `TaskTokenGuard` + scoped routes.
5. `/task-access` bridge page + single-task UI.
6. Audit logging + rate limiting.
