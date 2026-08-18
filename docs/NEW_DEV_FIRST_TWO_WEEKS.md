# New Developer — First 2 Weeks Task List

**Prepared:** August 2026
**Companion docs:** `DEVELOPER_INTRO_PACK.md` (orientation) and `INTERVIEW_CRIB_SHEET.md` (hiring)
**Goal:** get the new dev oriented, stand up shared dev + prod environments on paid tiers, establish a safe baseline, ship the first small cleanup PRs, and end with an agreed 30-day roadmap for the CTO.

---

## Working principles (reporting structure)

- **Daily async update** — three lines: *done / blocked / next*. Post in the shared channel the team agrees on.
- **Commits follow the house style** — conventional commit subject + a narrative body explaining *what changed and why* (see the repo's git history for examples).
- **No production schema change without CTO sign-off and a DB backup.**
- **Small, revertible PRs.** Never big-bang a rewrite of a load-bearing system (especially `next-step.service.ts`).
- **When in doubt, ask; when it's a judgement call, document the assumption.**

---

## Week 1 — Orientation + shared environments

### Day 1–2 · Orientation and local reproduction
- [ ] Read `docs/DEVELOPER_INTRO_PACK.md`, `PLATFORM_HANDOVER.md`, `NEW_SESSION_PROMPT.md`.
- [ ] `pnpm install` at repo root; run the API (`apps/api` → `pnpm start:dev`, port 3001) and web (`apps/web` → `pnpm dev`, port 3000).
- [ ] Create/connect a **personal Supabase dev database**; run the required `MANUAL_SQL_*.sql` files in order; run `pnpm exec prisma generate` in `apps/api`.
- [ ] Register a client account **and** a professional account locally.
- [ ] Walk the **SCALE_1 flow end-to-end**: create project → bid/quote → award → sign agreement → fund escrow → work-in-progress → progress report → completion.
- [ ] Read `apps/api/src/projects/next-step.service.ts` and `apps/web/src/components/next-steps/modal-dispatcher.tsx`.
- **Deliverable:** a short "questions & gotchas" note (local-run issues, missing env vars, confusing bits).

### Day 3 · Accounts, teams and paid tiers
- [ ] **GitHub:** confirm repo access (`github.com/romski28/fitouthub.git`, branch `main`); note current remote and branch.
- [ ] **Vercel:** create a team; invite CTO + stakeholders; set up **dev (preview)** and **production** projects for `apps/web`.
- [ ] **Render:** create **separate dev and prod API services** (distinct `DATABASE_URL`), from `render.yaml`.
- [ ] **Supabase:** create **separate dev and prod database projects** (never point both environments at one DB).
- [ ] Upgrade the currently-free platforms to paid tiers (Vercel Pro, Render paid tier to remove cold starts, Supabase Pro; add Expo/EAS when mobile work begins) — obtain owner/payment approval first.
- **Deliverable:** team/account setup done and invitees confirmed.

### Day 4 · Environment configuration
- [ ] Build **one env-var reference doc** covering web/API/Supabase for dev vs prod.
- [ ] Map every secret (`DATABASE_URL`, `DIRECT_URL`, JWT secrets, Google OAuth, DeepSeek, Qwen, Stripe, Twilio, Resend, R2) to the right environment; store secrets properly (platform secret stores, not in the repo).
- [ ] Point web-dev → api-dev and web-prod → api-prod.
- [ ] Deploy a trivial commit to confirm the **full pipeline works end-to-end** (git push → Vercel + Render auto-deploy).
- [ ] Smoke test registration/login on dev.
- **Deliverable:** working dev + prod environments, shared across devices, with documentation.

### Day 5 · Production safety checks
- [ ] **Verify the one-shot bcrypt migration actually ran on prod** — check `Identity.passwordHash` values are bcrypt hashes, not plaintext.
- [ ] Take a **production database backup**.
- [ ] Record current live URLs and environment identifiers (note the `fitouthub*` branding still in place pending rebrand).
- [ ] Confirm no uncommitted work is at risk; capture anything important.
- **Deliverable:** a one-page "current state of production" for the CTO.

---

## Week 2 — Baseline, first cleanups, iOS investigation

### Day 6 · Baseline and guardrails
- [ ] Run web lint + typecheck and API build/lint/tests; **record the current failures** (this is your baseline, not a blocker to fix all at once).
- [ ] Set up minimal CI (GitHub Actions or the platform's built-in checks): lint + typecheck + tests on every PR.
- [ ] Start a **migration ledger**: which `MANUAL_SQL_*.sql` files have been applied to dev vs prod, in what order.
- **Deliverable:** baseline report + CI running.

### Day 7 · Pick the first cleanup target
- [ ] Inventory the known duplication: chat rendering (`floating-chat.tsx`, `project-chat.tsx`, admin messaging), status chips, next-step modals.
- [ ] Score each by **risk vs. effort vs. duplication count**.
- [ ] Pick the lowest-risk, highest-duplication item; draft a plan and get CTO sign-off.
- **Deliverable:** a ranked cleanup backlog (keep it short and concrete).

### Day 8–9 · First safe PRs
- [ ] Ship **PR 1** of the chat shared renderer (add shared components only, **no behaviour change**) per `docs/CHAT_SHARED_COMPONENT_MIGRATION_PLAN.md`.
- [ ] Consolidate **one** duplicated UI element (e.g. a status chip) into a shared component.
- [ ] Apply the **Mimo Beige** theme to **one** non-conforming screen.
- [ ] Each PR small and revertible, with the house commit style; smoke-test on dev before merge.
- **Deliverable:** 2–3 merged, tested PRs.

### Day 10 · iOS Safari investigation
- [ ] Reproduce the home-page crash on iOS (works on desktop/Android).
- [ ] **Bisect** `SearchFlow`'s module imports (stub them one by one) to find the offending dependency.
- [ ] Write up findings; try one targeted fix (behind a flag if uncertain).
- **Deliverable:** diagnosis write-up + proposed fix (this is a known open issue — see intro pack §2/§9).

### Day 11–12 · Tests + documentation
- [ ] Add unit tests around `next-step.service.ts` (a state → next-action table).
- [ ] Add tests for the chat event parser (`chat-event-parser.ts`).
- [ ] Update the intro pack/runbook with anything you learned (ports, env vars, gotchas).
- **Deliverable:** measurably increased test coverage + fresher docs.

### Day 13–14 · Report and roadmap
- [ ] Prepare a **30-day roadmap** for the CTO covering: mobile path, cleanup sequence, admin command centre, and the deferred items (retention, professional availability).
- [ ] Demo the dev + prod environments to the team.
- [ ] Hold a weekly review; agree the next sprint.
- **Deliverable:** written 30-day roadmap + environment handover to the CTO.

---

## Definition of done (end of Week 2)

- [ ] Dev **and** prod environments live, shared across devices, and accounts upgraded to paid tiers.
- [ ] Production state documented and backed up.
- [ ] CI running (lint + typecheck + tests on PR).
- [ ] ≥2 cleanup PRs merged.
- [ ] iOS issue diagnosed with a written plan.
- [ ] 30-day roadmap agreed with the CTO.

---

## Reporting cadence

| Cadence | Output |
|---|---|
| Daily | Three-line update: done / blocked / next |
| Weekly | Written summary + short demo |
| Production changes | CTO sign-off + backup first |
| Blockers | Flag same day, never bury them |
