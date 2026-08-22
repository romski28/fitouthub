# Smoke Test Checklist — Address + Persona + Worker Invite/Magic Link

Manual run-through for the property-address system, persona-based address
management, and worker invite + 48h project-access magic link.

Pre-reqs: SQL from `MANUAL_SQL_*` applied (dev + prod), API deployed (Render),
web deployed (Vercel). Two browser profiles (or incognito windows) help for the
worker section.

---

## A. Canonical property-address system

| # | Action | Where | Expected |
|---|--------|-------|----------|
| 1 | Log in as a client | Web | Dashboard loads |
| 2 | Start "Create project" → address picker | Create-project wizard | District dropdown is populated |
| 3 | Type a few letters in the building field | Address picker | Gazetteer typeahead suggests CSDI buildings (empty is OK if no CSDI rows) |
| 4 | Pick district + building, enter block/floor/unit | Address picker | Preview shows a formatted display address |
| 5 | Save the project | Create-project wizard | Project saved; property row created |
| 6 | Create a **second** project with the **same** address but different casing/punctuation (e.g. `Block A` vs `block a`, `Tower` vs `tower`) | Create-project wizard | It resolves to the **same** property row (dedup by canonical key) |
| 7 | Open Admin → Properties | `/admin/properties` | List + search tabs render; search finds the building |
| 8 | Check match candidates | Admin → Properties (review tab) | Similar-spelled buildings (≥0.6 trigram) appear as pending review |
| 9 | Resolve a candidate (merge/dismiss) | Admin → Properties | Candidate leaves the pending queue |

SQL spot-checks (Supabase SQL editor):

```sql
-- dedup: one row per canonical key
SELECT "canonicalKey", COUNT(*) FROM "Property" GROUP BY "canonicalKey" HAVING COUNT(*) > 1;
-- match candidates
SELECT * FROM "PropertyMatchCandidate" WHERE status = 'pending' LIMIT 20;
```

---

## B. Persona-based address management

| # | Action | Where | Expected |
|---|--------|-------|----------|
| 1 | Register a **client** persona | Register | — |
| 2 | Go to profile → Addresses | `/profile` (client) | Single-address manager; add an address |
| 3 | Add a **second** address | Address manager | First address is **replaced** (single-cardinality) |
| 4 | Register an **owner-occupier** (`owner_occupier`) | Register | Same as client — one address only |
| 5 | Register a **landlord** | Register | — |
| 6 | Add two addresses | Address manager (landlord) | Both are kept (multi-cardinality); one is "primary" |
| 7 | Change primary address | Address manager | Primary badge moves |
| 8 | Remove an address | Address manager | Link removed; a new primary is auto-assigned if needed |
| 9 | Register a **worker** (professionType `worker`) | Worker invite flow (§C) | Profile shows a read-only note "business address is managed by your employer" (no address manager) |

---

## C. Worker invite + project access magic link

### C1 — Employer invites a worker

| # | Action | Where | Expected |
|---|--------|-------|----------|
| 1 | Register/log in as a professional (company) | `/professional` | Profile loads |
| 2 | Open "Worker team" section | `/professional/profile` | Empty team list |
| 3 | Invite a worker by email | Worker team manager | Invite created; a `join-worker?token=…` link is shown (copy it) |
| 4 | Open the invite link in a new browser profile | `/join-worker?token=…` | Shows employer name + registration form |
| 5 | Register as worker (professionType `worker`) | Join-worker page | After register, lands on project list, then redirected to `/worker-projects` |
| 6 | Back in employer profile | Worker team manager | Worker now listed; invite shows "accepted" |

### C2 — Grant project access

| # | Action | Where | Expected |
|---|--------|-------|----------|
| 1 | Employer opens an awarded project | `/professional-projects/[id]` | Project detail loads |
| 2 | Click "👷 Worker access" | Project detail header | Modal with two tabs |
| 3 | **Registered worker** tab → pick the worker → Grant | Modal | Grant appears under "Active access" (ongoing) |
| 4 | **Email magic link** tab → enter a (new) worker email → create link | Modal | 48h link shown; copy it |
| 5 | Open the 48h link | `/worker-project-access?token=…` | Resolves; shows login or registration form for that email |
| 6 | Complete login/registration | Landing page | Redirects to `/worker-project/[projectId]` |
| 7 | Worker sees the project | Worker project page | Project name, site address, employer, photos shown |

### C3 — Worker on-site actions + enforcement

| # | Action | Where | Expected |
|---|--------|-------|----------|
| 1 | Worker opens a granted project | `/worker-projects` → project | Loads successfully |
| 2 | Post "Checked in on site" with a note | Worker project page | Success; message appears in the **project chat** |
| 3 | Post "Started work" / "Post progress update" / "Mark complete" | Worker project page | Each posts an attributed message to project chat |
| 4 | Try to open the project URL while logged in as a **different worker** (no grant) | `/worker-project/[id]` | Blocked — "Access denied" (403) |
| 5 | Try the same URL as a **client** | `/worker-project/[id]` | Blocked (403) |
| 6 | Employer revokes a grant | Project access modal → Revoke | Worker loses access on next load (403) |

---

## D. Quick API equivalents (optional, via curl/PowerShell)

```powershell
$base = "https://fitouthub.onrender.com/api"

# register a client
Invoke-RestMethod -Method Post "$base/auth/register" -ContentType 'application/json' -Body (@{
  email='client@test.local'; password='Password123!'; firstName='C'; surname='Test'; role='client'; requireOtpVerification=$false
} | ConvertTo-Json)
```

Or run the full automated pass:

```powershell
node smoke-test-worker-address.js
```

If that prints nothing, make sure you run it **with `node`** (PowerShell won't
execute a `.js` file by itself) and from the repo root:

```powershell
cd C:\Xampp_webserver\htdocs\renovation-platform
node smoke-test-worker-address.js
```
