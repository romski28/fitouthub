You are working on a Hong Kong renovation platform called "Mimo" — a two-sided marketplace connecting clients with renovation professionals.

## Architecture
- **API:** NestJS + Prisma + PostgreSQL (Supabase), deployed on Render (free tier)
- **Web:** Next.js 16 App Router, deployed on Vercel
- **Prisma schema:** `apps/api/prisma/schema.prisma`
- **Key models:** `Project`, `ProjectProfessional`, `Professional`, `User`, `FinancialTransaction`, `NextStepAction`, `SiteAccessRequest`, `Survey`, `Contract`

## Design System ("Mimo Beige")
- Card bg: `bg-[#F5EEDE]` | Border: `border-[#D4C8A0]`
- Coral heading: `text-[#FF7F50]` | Body text: `text-stone-600`/`text-stone-700`
- Primary button: `bg-emerald-600 text-white`
- Secondary button: `border-[rgba(120,53,15,0.2)] text-stone-700`
- Dark charcoal: `text-[#4A3623]`
- Modals use a flip-card pattern with `[perspective:1600px]` and `rotateY(180deg)` for front/back faces

## Project Lifecycle (ProjectStage enum)
`CREATED → BIDDING_ACTIVE → QUOTE_RECEIVED → CONTRACT_PHASE → WORK_IN_PROGRESS → MILESTONE_PENDING → PAYMENT_RELEASED → COMPLETE → CLOSED`

- **SCALE_1:** Single milestone (small projects) — skips schedule confirmation after signing
- **SCALE_2:** Two milestones — has schedule confirmation gate
- **SCALE_3:** Multiple milestones — full schedule workflow

## Key Files

### API (backend)
- `apps/api/src/projects/next-step.service.ts` — Core next-step logic. Cache keyed by `userId:role:stage` stored in `Project.nextStepCache` JSON column. Stage transitions trigger recomputation; cache hits are cheap JSON reads.
- `apps/api/src/projects/projects.service.ts` — Project CRUD, `awardQuote()` sets `project.startDate` from pro's `quoteEstimatedStartAt`
- `apps/api/src/projects/contract.service.ts` — Signing flow. Creates escrow deposit request when both sign. Flushes `nextStepCache` on signature.
- `apps/api/src/projects/projects.controller.ts` — Role detection: checks `professionalId` OR `professional.userId` (was recently fixed — was only checking `professionalId`)
- `apps/api/src/financial/financial.service.ts` — Escrow, Stripe checkout. `createEscrowCheckoutSession()` builds Stripe session with project name as title and project ID as `client_reference_id`.
- `apps/api/src/financial/stripe-payments.service.ts` — Thin Stripe wrapper

### Web (frontend)
- `apps/web/src/lib/next-steps.ts` — Frontend next-step cache (Map, 30s TTL), `fetchPrimaryNextStep()`, `invalidateNextStepCache()`, `completeNextStep()`
- `apps/web/src/components/next-steps/modal-dispatcher.tsx` — Routes `actionKey` to the correct modal component (contract, escrow, quote, schedule, etc.)
- `apps/web/src/components/next-steps/contract-action-modal.tsx` — Agreement review/signing modal (Mimo-ified, flip-card)
- `apps/web/src/components/next-steps/review-quotes-modal.tsx` — Client quote review. After accepting, shows success with "Review agreement" button.
- `apps/web/src/components/next-steps/quote-action-modal.tsx` — Pro quote submission. Success now uses `ProQuoteSuccessModal` (single "OK" button, navigates to `/professional-projects`).
- `apps/web/src/components/next-steps/deposit-escrow-modal.tsx` — Escrow deposit
- `apps/web/src/components/workflow-completion-modal.tsx` — Shared confetti success modal with next-step CTA
- `apps/web/src/components/work-date-picker.tsx` — Custom date picker with HK holiday blocking
- `apps/web/src/components/mimo-spinner.tsx` — Shared coral spinner (sm/md/lg)
- `apps/web/src/app/projects/[id]/page.tsx` — Client project detail. Has `workflowModalOpen`/`openPaymentWorkflowModal` for Stripe success flow. Now shows pro start date in escrow completion.
- `apps/web/src/app/professional-projects/page.tsx` — Pro list. 60s polling interval + visibility refresh.
- `apps/web/src/app/professional-projects/[id]/page.tsx` — Pro project detail
- `apps/web/src/app/projects/projects-client.tsx` — Client list. Visibility-based refresh only (no polling).
- `apps/web/src/app/create-project/page.tsx` — Project creation. `buildProjectPayload()` now uses only `formData.tradesRequired` (not merged with AI suggestions — fixed additive merge bug).

## Recent Fixes (July 2-3, 2026)

1. **Role detection bug:** Pro users misidentified as CLIENT in next-step controller — `professionalId` vs `professional.userId` mismatch. Fixed by adding OR condition.
2. **Cache invalidation on signing:** `nextStepCache` now flushed when either party signs AND at award time. Previously stale cache blocked post-signing progression.
3. **Client start-date fallback:** When both sign but `startDateAgreed` is false, client now sees "Agree start date" instead of nothing.
4. **Start date auto-set at award:** `awardQuote()` copies `quoteEstimatedStartAt` → `project.startDate`. Combined with `project.endDate` from duration.
5. **Frontend cache TTL:** Dropped from 15min to 30s so pro list polls hit the API (which returns cheap cached JSON when stage hasn't changed).
6. **Stripe checkout metadata:** Project name as product title, project ID as `client_reference_id`, both in session + payment intent metadata.
7. **Trades handoff bug:** `buildProjectPayload()` was merging removed trades back from AI suggestion sources — now uses `formData.tradesRequired` as sole source.
8. **Pro quote success modal:** Simplified to single "OK" button navigating to `/professional-projects`. Client "Quote accepted" modal lost the "Open project" button.
9. **ContractActionModal Mimo-ified:** Both front and back faces now use beige theme.

## Common Patterns
- Next-step modals use `useNextStepModal()` context → `openModal(actionKey, projectId, ...)` → `ModalDispatcher` renders the right component
- `WorkflowCompletionModal` is the shared confetti success screen with next-step CTA
- `invalidateNextStepCache(projectId)` clears both frontend Map cache and API JSON cache
- Pro auth uses `useProfessionalAuth()`, client auth uses `useAuth()` — different tokens
- `fetchPrimaryNextStep()` wraps the API with deduplication via `nextStepInFlight` Map
- Date formatting uses `en-GB` locale throughout
- Currency is HKD, formatted as `HK$ X,XXX`

## Active Context
We've been working through the full SCALE_1 workflow: create → quote → award → sign agreement → deposit escrow. The flow now runs cleanly. Current focus is on next-step refresh latency for the cross-user case (client does something, pro sees it). The 30s TTL + 60s poll is the pragmatic fix; Supabase real-time/webhooks would be the ideal future solution.

Get familiar with `next-step.service.ts` — it's the most complex file and the source of most bugs.
