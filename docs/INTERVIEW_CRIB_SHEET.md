# Mimo Platform — Developer Interview Crib Sheet (Interviewer's Edition)

**Prepared:** August 2026 · **Updated:** expanded for the interviewer running the session
**Purpose:** assess three things:
1. **Technical know-how** — can they actually work in our stack?
2. **Loose remit / outside-the-box thinking** — can they own a vague brief?
3. **Reporting structure mindfulness** — will they keep the CTO and stakeholders in the loop?

> **This edition is written for you**, the person asking the questions — including if you don't consider yourself an advanced developer. Every question below is "decoded": **why we ask it, how to ask it, what a strong answer sounds like, what a weak answer sounds like, and how to score it.**

---

## 0. Read this first — how to run the interview

### 0.1 You don't need to be a technical expert
Most of what we're scoring is **method and behaviour**, not memorised facts. You're looking for patterns: does the person give concrete examples, do they admit what they don't know, do they think about risks and communication? Those are visible to anyone.

### 0.2 The traffic-light scoring (use this all the way through)
Score each answer as soon as they finish:

| Light | Score | Meaning |
|---|---|---|
| 🟢 | 2 | Strong — clear, gives a **specific example**, mentions the key idea |
| 🟡 | 1 | Partial — roughly right but vague or incomplete |
| 🔴 | 0 | Weak — no idea, bluffs, or irrelevant |

- **One or two 🔴 is fine.** Nobody knows everything. What matters is *how* they handle it.
- **When they say "I don't know":** probe with *"How would you go and find out?"* That answer is often more revealing than the original one.
- **When they say something you don't understand:** say *"Can you give me an example?"* or *"What would that look like in our project?"* A strong candidate can explain a hard thing simply. A weak one hides behind jargon.

### 0.3 Don't ask everything — pick a core path
Aim for **60–90 minutes** total. Everyone gets Part 0. Then pick:

- **Technical:** A1, B3, C6, D7, E9, H14 (six questions — enough to judge)
- **Autonomy:** 15, 17, 19
- **Reporting:** 21, 22, 23, 25

Add more only if you need to break a tie.

### 0.4 Before the interview
- [ ] Re-read `docs/DEVELOPER_INTRO_PACK.md` §2 "Current state — the honest version" so you can talk about the platform confidently.
- [ ] Print or copy the **Live scoring sheet** at the end of this document.
- [ ] Prepare 5 minutes to describe the platform to the candidate in plain English (see the "pitch" box in Part 0).

### 0.5 Five things that can trip YOU up (and how to avoid them)
1. **Jargon overload** — a candidate names 20 tools. Don't be impressed; ask *"which of those did you actually use to ship something?"*
2. **Silence is OK** — give them 5–10 seconds to think. Don't fill the gap for them.
3. **They go deep and you get lost** — say *"That's interesting — what would that mean for our project in practice?"* It brings them back to something you can judge.
4. **Charisma ≠ competence** — score the answer, not the delivery.
5. **You don't know an answer either** — it's fine. Say *"I'm not sure I know the answer to that — explain it to me."* How they explain it *is* the test.

---

## Part 0 — Quick filter (5 min, for all candidates)

**Start by describing the platform in one minute (your "pitch"):**
> "Mimo is a Hong Kong renovation marketplace. A client describes their job to an AI assistant, we match it to the right trades, professionals bid and quote, the client picks one, they sign an agreement, the client pays into escrow, and we track the work through progress reports to completion. Web app for everyone; admin stays on the web; a mobile app comes later. It's a TypeScript monorepo: Next.js frontend, NestJS API, PostgreSQL on Supabase."

---

### Q1 — "What in that stack have you actually shipped to production, and what was your role?"

- **Why we ask:** separates real experience from buzzwords. Someone can list our whole stack and still have never shipped anything.
- **How to ask:** read the stack slowly, then: *"Be specific — what did **you** build, and what went wrong in production that you had to fix?"*
- 🟢 **Strong:** "I built the login and password-reset flow in a NestJS app, deployed it on Render, and fixed a CORS bug when mobile users couldn't log in. I found it by checking the logs." → owns it, names a real failure and how they found it.
- 🔴 **Weak:** "I've used all of those." / "We built a platform…" (only "we", never "I") / can't name a single thing that broke.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

### Q2 — "How do you get productive in a messy repo you didn't write?"

- **Why we ask:** our repo is genuinely messy (duplicated chat code, two auth systems mid-migration, ~60 SQL/markdown files at the root). We need someone who **improves** it, not someone who complains or nukes it.
- **How to ask:** describe the mess plainly, then *"Walk me through your first week."*
- 🟢 **Strong:** "I'd read the docs and the main entry points first, then trace one user journey end-to-end (say, project creation), take notes, and fix small things as I go. I'd ask before touching anything big."
- 🔴 **Weak:** "I'd rewrite it in my preferred framework." / "Whoever wrote this made a mess."
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

## Part 1 — Technical know-how

### A. TypeScript

#### Q1 — "When would you use `unknown` over `any`, and name a bug `strict` mode would have caught?"

- **Why we ask:** our whole codebase is TypeScript. If they can't explain this, they'll struggle.
- **Plain English:** `any` switches off all safety checks. `unknown` also means "could be anything", but forces the developer to *check what it is* before using it. `strict` mode catches "this value might be null/undefined" errors **before** they reach production.
- 🟢 **Strong:** "`unknown` makes me narrow the type before I use it, so I can't accidentally call a method on something that isn't there. A classic strict-mode catch: accessing `user.email` when `user` could be null — it fails at compile time instead of crashing at runtime."
- 🔴 **Weak:** "They're basically the same thing." / no bug example.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q2 — "Our API uses `(this.prisma as any)` in places. Why is that a smell, and how would you fix it safely?"

- **Why we ask:** this pattern exists in our code. We want someone who will remove it **carefully**.
- **Plain English:** `as any` is a shortcut that turns the safety net off — the compiler won't warn you when a database column is renamed or removed, so the app breaks only at runtime.
- 🟢 **Strong:** "It bypasses type checking, so schema changes break silently. I'd replace it with proper typed Prisma calls or a typed wrapper, one call site at a time, with a test or a smoke check each time."
- 🔴 **Weak:** "It works, so I'd leave it." / no idea why it matters.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

### B. React 19 / Next.js 16

#### Q3 — "What are the rules for `'use client'`, and what would you check if a page is blank on iOS Safari but fine on desktop?"

- **Why we ask:** React/Next fundamentals **plus** a real bug we currently have (iOS home page crash).
- **Plain English:** `'use client'` marks a component to run in the browser. A page blank only on iOS usually points to a browser-specific error or a stale service-worker cache, not a logic bug.
- 🟢 **Strong:** "`'use client'` components run in the browser, the rest can be server components. For the iOS blank page I'd open the console for hydration errors, disable the service worker and clear cache, then build a minimal page and add pieces back until I find the module that breaks it."
- 🔴 **Weak:** "Maybe the phone is just old." / no process, just guessing.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q4 — "How do you debug a modal that doesn't open only after a specific sequence of actions?"

- **Why we ask:** our next-step modal system has exactly this class of bug (state + cached "what's next" data getting out of sync).
- 🟢 **Strong:** "Reproduce the exact sequence, then check state and re-renders in React DevTools, look for stale closures or a cached 'next step' that didn't refresh, add logs, and narrow the trigger by removing steps."
- 🔴 **Weak:** "I'd sprinkle console.log everywhere and hope." / no method.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

### C. NestJS / backend

#### Q5 — "Walk me through adding a new authenticated REST endpoint in NestJS."

- **Why we ask:** core NestJS structure — they'll do this on day one.
- **Plain English:** NestJS splits work into **modules** (register the feature), **controllers** (the URL/endpoint), **services** (the business logic), and **guards** (the auth check).
- 🟢 **Strong:** "Create and register a module, add a controller with the route, put the logic in a service, and apply the JWT guard — plus a role guard — so only authorised users can call it."
- 🔴 **Weak:** can't name the pieces, or doesn't know where auth is checked.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q6 — "Our `next-step.service.ts` computes 'what comes next' and caches it in a JSON column. How do you make stage changes always invalidate that cache, and how do you test it?"

- **Why we ask:** this is the **heart of our platform**. Historically the source of most bugs.
- **Plain English:** the app decides each user's next action and remembers it ("caches" it) to be fast. The #1 bug is showing a **stale** action after the project moved on. The fix is to make one place responsible for clearing that memory whenever the project changes.
- 🟢 **Strong:** "Route every stage transition through a single place that always clears/recomputes the cached step, keep the cache key explicit (user + role + stage), and write a test table: each state → the expected next action."
- 🔴 **Weak:** "Just delete the cache column sometimes." / no structure.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

### D. Prisma + PostgreSQL

#### Q7 — "We deliberately do NOT use Prisma migrations — schema changes are manual SQL files. What risks does that create, and how would you make it safe?"

- **Why we ask:** this is our **biggest process risk**. The right person treats it seriously.
- **Plain English:** because database changes are done by hand, the biggest dangers are (1) the code's view of the database getting out of sync with reality, and (2) someone forgetting to run a script in production.
- 🟢 **Strong:** "The schema file can drift from the live database, and a change can be forgotten in prod. I'd keep a checked-in ledger of which SQL files have run where, write scripts to be idempotent (safe to re-run), and always have a rollback before touching prod."
- 🔴 **Weak:** "Manual SQL is fine if you're careful." (no actual safeguards)
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q8 — "Explain RLS in one minute, and give an example of a query that silently returns fewer rows if a policy is wrong."

- **Why we ask:** we use RLS (row-level security) on the database.
- **Plain English:** RLS means the **database itself** hides rows a user isn't allowed to see, based on who's logged in. The scary part: a wrong policy doesn't error — it just quietly returns fewer rows.
- 🟢 **Strong:** "RLS filters rows per query based on the current user/role. A wrong policy would silently filter out rows that should be visible — I'd debug by impersonating the user (`SET role`) and comparing row counts."
- 🔴 **Weak:** doesn't know what RLS is.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

### E. Auth & security

#### Q9 — "We moved from plaintext passwords to bcrypt with a one-shot migration. What's the correct sequence, and what else should you check?"

- **Why we ask:** security discipline, and this mirrors our **real** migration.
- **Plain English:** you can't just hash everything overnight or everyone gets locked out. You need a transition where old and new can both work for a while.
- 🟢 **Strong:** "Hash on new writes; during a transition window accept old plaintext and re-hash it on their next successful login; then run the one-shot script and remove the old path. Also check rate limiting, refresh-token rotation, and that OAuth identifiers match (we had a `sub` mismatch bug)."
- 🔴 **Weak:** "Just run the script." / no transition thinking.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q10 — "We're unifying two auth systems (`User` and `Professional`) under `Identity`/`Persona`. What's the safest way to do that in production?"

- **Why we ask:** this is our live, half-finished migration.
- **Plain English:** merging account systems is high-risk. The safe pattern is "dual-run": add the new layer alongside the old, read from new first and fall back to old, migrate piece by piece behind a switch, keep rollback.
- 🟢 **Strong:** "Phased, dual-read: stand up the new identity layer beside the old, migrate one service at a time behind a feature flag, and keep a rollback path. Definitely not a big-bang merge."
- 🔴 **Weak:** "Merge them in one PR over a weekend."
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

### F. DevOps / environments

#### Q11 — "We want separate dev and prod environments on Vercel, Render and Supabase, shared across several people. How do you keep them in sync and avoid pointing at the wrong database?"

- **Why we ask:** this is literally their **first job**.
- 🟢 **Strong:** "One source of truth for environment variables, secrets in the platform's secret store (not git), separate databases per environment, preview vs production deploys, and team accounts with a written onboarding doc."
- 🔴 **Weak:** "Just use the same database for both." / vague.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q12 — "What's your CI/release workflow for a pnpm monorepo, and what would you add to catch regressions before prod?"

- **Why we ask:** they'll set up CI in week 2.
- 🟢 **Strong:** "Every PR runs lint + typecheck + tests, only the affected packages build (turbo), a preview deploy is created for review, and database SQL runs **before** the code that depends on it."
- 🔴 **Weak:** "I don't really use CI." / no workflow.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

### G. AI integration (differentiator)

#### Q13 — "Our AI wizard uses DeepSeek for intake and Qwen for images, and we store logs for training. What do you watch out for when the model's output is non-deterministic but downstream code depends on structured fields?"

- **Why we ask:** AI is core to our product — a genuine differentiator for the role.
- **Plain English:** AI answers vary run-to-run, but our app needs **structured** data (fields, options). The risk is the model returning something malformed and the app crashing or showing garbage.
- 🟢 **Strong:** "Validate the model's output against a schema before using it, retry or fall back gracefully, store both the raw response and the parsed result, version my prompts, and watch cost and latency."
- 🔴 **Weak:** "The AI just works, we trust it." / no validation concept.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

### H. Debugging (the real test)

#### Q14 — Scenario: "iOS Safari hangs on the home page, but desktop and Android are fine. Static import crashes the bundle; dynamic import never resolves. How do you isolate the culprit module?"

- **Why we ask:** this is a **live open bug**. Strong candidates will show a *method*, not a guess.
- 🟢 **Strong:** "Bisect: disable or stub imports one at a time to find the module that hangs it, check for browser features Safari doesn't support (like `structuredClone` or top-level await), and check the service worker/cache. Once isolated, test a minimal page to confirm."
- 🔴 **Weak:** "Reinstall the browser." / "It's an Apple bug." / no method.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

## Part 2 — Loose remit & outside-the-box thinking

The job isn't fully specced. You're probing **judgement under ambiguity**.

#### Q15 — "We'll hand you a vague goal like 'streamline the codebase'. What's your first week look like?"

- **Why we ask:** exactly how we'll work with them.
- 🟢 **Strong:** "Inventory the problems, rank them by risk vs value, propose a measurable plan, and check in with you before any big change."
- 🔴 **Weak:** "I'd start rewriting the backend immediately."
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q16 — "Tell me about a time you had an unclear brief and had to make a call. What did you decide, what did you NOT do, and what would you do differently?"

- **Why we ask:** reveals judgement and whether they communicate their assumptions.
- 🟢 **Strong:** a concrete story that names a decision, what they deliberately left out, and a lesson. They mention *telling someone* their assumptions.
- 🔴 **Weak:** "I just did what I thought was best." (no communication, no reflection)
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q17 — "A quick hack ships today; a clean fix takes three days. How do you decide, and how do you communicate it?"

- **Why we ask:** the classic judgement call.
- 🟢 **Strong:** "Depends on context — if users are blocked, ship the hack but **log the debt and schedule the clean fix**, and say so out loud. If it's not urgent, do it properly."
- 🔴 **Weak:** always hacks, or always gold-plates, without considering context — and never flags the trade-off.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q18 — "Give an example of an improvement you proposed that nobody asked for, and how you got it adopted."

- **Why we ask:** "outside the box but respects the structure".
- 🟢 **Strong:** "I built a quick prototype, showed the value, got buy-in, then shipped it."
- 🔴 **Weak:** "I just did it and told them later." (bypasses stakeholders) — or no example at all.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q19 — "You inherit a feature that works but is ugly and duplicated. How do you improve it without breaking it?"

- **Why we ask:** this is our exact cleanup situation (we have a PR1–PR5 chat-renderer plan). See if they invent the same *shape*.
- 🟢 **Strong:** "Characterise current behaviour with tests, refactor in small phased PRs, check parity (same output before/after), keep rollback."
- 🔴 **Weak:** "Rewrite it from scratch in one go."
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q20 — "When you don't know something, what's your process? Give a specific example of learning a technology fast and shipping with it."

- **Why we ask:** they'll hit unknowns constantly. Look for honest curiosity, not bluffing.
- 🟢 **Strong:** "Read the docs and the actual code first, run small experiments, ask when stuck. Example: I learned X in a weekend and shipped Y by Tuesday."
- 🔴 **Weak:** "I don't need to learn — I know everything." / no example / can't name a real learning moment.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

### Mini exercise (10–15 min, optional but recommended)

> "Here's our `ProjectStage` enum. Design — whiteboard or pseudo-code — how you'd add a new stage `FINAL_INSPECTION` so the right actor sees the right 'next step' button, the cache invalidates correctly, and the admin can see it in the command centre."

- **Score 5/5 if** they (a) ask clarifying questions first, and (b) touch all four: state machine, cache invalidation, actor roles, UI dispatch + admin visibility.
- **Score 2/5 if** they just draw a button without thinking about roles or cache.
- **Watch for:** do they start with questions, or dive straight into code?

---

## Part 3 — Reporting structure & governance

For a project with a CTO, a dev, and stakeholders who must stay in sync.

#### Q21 — "Describe your ideal working cadence with a non-technical or semi-technical CTO. What do you write down vs say in a meeting?"

- **Why we ask:** you need someone who communicates without you having to chase.
- 🟢 **Strong:** "A short written async update every day (done / blocked / next), screenshots or a quick video demo for anything visual, decisions written down, and a weekly review meeting."
- 🔴 **Weak:** "I'll just talk to you when there's something to say."
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q22 — "We have a house style for commits: subject + a short body explaining **what changed and why**. Show me how you'd write the commit for 'wrap long button labels on mobile'."

- **Why we ask:** we genuinely enforce this style. Have them **type or say it** — don't accept "I'd write a good message".
- **Expected strong answer** (anything like this):
  > `fix(mobile): wrap next-step buttons so long labels don't overflow`
  >
  > `- Removed whitespace-nowrap so labels wrap on small screens instead of forcing the page wider.`
  >
  > `- Added horizontal scrolling to the items table so it scrolls rather than breaking layout.`
- 🔴 **Weak:** "fix stuff" / "updated code" / no "why".
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q23 — "How do you handle it when the CTO asks for something technically risky or a bad idea? Give a concrete example of pushing back."

- **Why we ask:** we want respect + evidence, not blind obedience or arrogance.
- 🟢 **Strong:** "I'd explain the risk with evidence, offer a safer alternative, and then do whatever is decided — but with the risk documented."
- 🔴 **Weak:** "Whatever you say, boss." / "I'd just refuse."
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q24 — "How do you estimate work in an unfamiliar codebase? What do you do when you're going to miss a deadline?"

- **Why we ask:** honest estimation and early warning.
- 🟢 **Strong:** "I give ranges with assumptions, spend a little time investigating first, and the moment I see I'm going to slip, I say so and re-plan — no surprises."
- 🔴 **Weak:** "I never miss deadlines." / no process for flagging.
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q25 — "A stakeholder asks 'is the app done?' — the web is done but iOS crashes on the home page. How do you answer?"

- **Why we ask:** the honesty test. This is our *actual* situation.
- 🟢 **Strong:** "The web is done and working. The mobile web has a known crash on iOS — here's the status, what I've ruled out, and the plan to fix it."
- 🔴 **Weak:** "Yeah, it's done." (hides the bug — instant disqualifier)
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q26 — "What does a good handover document look like? What would you want the previous dev to have left you?"

- **Why we ask:** they'll inherit *and* produce these. See if they'd actually read our intro pack and update it.
- 🟢 **Strong:** "A runbook: how to run it, environment variables, an architecture diagram, known issues, and exactly how to deploy."
- 🔴 **Weak:** "I don't write docs." / "Documentation isn't my job."
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

#### Q27 (culture fit) — "In a small team, you'll sometimes be the only person who understands a subsystem. How do you avoid becoming a single point of failure?"

- **Why we ask:** we need the knowledge shared, not hoarded.
- 🟢 **Strong:** "Document as I go, pair on tricky bits, do code reviews, and keep people informed — so someone else can take over."
- 🔴 **Weak:** "I'll keep it all in my head; that's why you hired me."
- **Score:** 🟢 2 / 🟡 1 / 🔴 0

---

## Part 4 — Red flags vs. green flags

Use this during and after. If you see a red flag, probe once — sometimes it's nerves, not character.

| 🟢 Green flags | 🔴 Red flags |
|---|---|
| Asks clarifying questions before proposing solutions | Immediately proposes a full rewrite |
| Traces a bug end-to-end before touching code | Blames the previous dev / "messy code" without specifics |
| Mentions cache invalidation, rollback, and testing unprompted | No answer for "what broke in production" |
| Writes why, not just what, in commits | Vague ownership ("we" did everything) |
| Flags risks and offers alternatives when pushing back | Passive "whatever you want" or argumentative |
| Can explain RLS / hydration / token refresh clearly | Confuses Prisma migration vs manual SQL |
| Voluntarily documents and updates runbooks | Says "documentation is not my job" |
| Comfortable saying "I don't know, here's how I'd find out" | Bluffs or invents APIs |
| Picks pragmatic scope: hack now + log the debt | Gold-plates or ships landmines silently |
| Explains a hard concept simply when you ask | Hides behind jargon you can't follow |

---

## Part 5 — Scoring: turning traffic-lights into 3 numbers

At the end, give each candidate **three scores out of 5**:

| Dimension | What a 1 looks like | What a 3 looks like | What a 5 looks like |
|---|---|---|---|
| **Technical** | Can't go deep on the stack; no real prod experience | Solid on most; honest gaps in a couple of areas | Deep, with concrete prod war stories and honest gaps |
| **Autonomy / outside-the-box** | Needs a full spec; no initiative | Delivers on vague briefs; proposes improvements | Shapes the brief, prioritises well, aligns stakeholders |
| **Reporting / governance** | Communicates little; hides risks | Regular updates, honest status | Proactive, writes why, flags early, documents |

**How to convert your per-question lights:**
- Mostly 🟢 in a dimension → **4 or 5**
- A mix of 🟢 and 🟡 → **3**
- Mostly 🟡 or any 🔴 → **2 or less**

**Recommended thresholds:**
- **≥4 in all three** → strong yes.
- **Technical 5 but reporting 2** → high risk in a multi-stakeholder project. Probe carefully before hiring.
- **Reporting 5 but technical 2** → they'll communicate well but can't do the work. No.

---

## Live scoring sheet (print or copy)

| # | Question | 🟢 2 | 🟡 1 | 🔴 0 | Notes |
|---|---|---|---|---|---|
| 0.1 | Shipped to prod / role | | | | |
| 0.2 | Approach to messy repo | | | | |
| 1 | `unknown` vs `any` / strict | | | | |
| 2 | `prisma as any` smell | | | | |
| 3 | `use client` / iOS blank | | | | |
| 4 | Debug modal sequence | | | | |
| 5 | NestJS endpoint | | | | |
| 6 | Next-step cache | | | | |
| 7 | Manual SQL risks | | | | |
| 8 | RLS | | | | |
| 9 | bcrypt migration | | | | |
| 10 | Auth unification | | | | |
| 11 | Dev/prod environments | | | | |
| 12 | CI workflow | | | | |
| 13 | AI structured output | | | | |
| 14 | iOS Safari isolation | | | | |
| 15 | Vague goal → plan | | | | |
| 16 | Unclear brief story | | | | |
| 17 | Hack vs clean fix | | | | |
| 18 | Unasked improvement | | | | |
| 19 | Improve duplicated feature | | | | |
| 20 | Learning process | | | | |
| 21 | Cadence with CTO | | | | |
| 22 | Commit message example | | | | |
| 23 | Push back on CTO | | | | |
| 24 | Estimation / miss deadline | | | | |
| 25 | "Is the app done?" | | | | |
| 26 | Handover doc | | | | |
| 27 | Single point of failure | | | | |

**Totals:**
- Technical (`0.1–14`) : ___ / 28 → convert to /5: ___
- Autonomy (`15–20`) : ___ / 12 → convert to /5: ___
- Reporting (`21–27`) : ___ / 14 → convert to /5: ___

**Final:** Technical ___ /5 · Autonomy ___ /5 · Reporting ___ /5
**Verdict:** ☐ Yes ☐ No ☐ Second interview ☐ Conditional

---

## Suggested candidate exercise (take-home, 2–4 hours, optional)

> "Fork the repo, run web + API locally against your own Supabase project, and make one small improvement: pick one duplicated UI element (e.g. a status chip) and consolidate it into a shared component. Submit a PR with a PR description that follows the house style."

**Why it's the best test:** this one exercise tests the *entire* stack — environment setup, manual SQL, NestJS/Next.js, refactoring discipline, and communication style. Far more informative than trivia.

**How to judge the result (look for these four things):**
1. **Did they get it running?** (environment skill)
2. **Was the change small and safe?** (judgement — not a rewrite)
3. **Did the PR description explain what *and why*?** (reporting style)
4. **Did they ask a sensible question if blocked?** (communication)
