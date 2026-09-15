# Client Delegation — Implementation Plan

> Status: **Planning / Phase A1 spec complete (this doc)**
> Goal: let a client invite a delegate (family/helper) to assist on their projects.
> Model of truth: mirror the existing worker-invite flow (`WorkerInvite` → `ProjectWorkerAccess`).

---

## 1. Decisions locked in

| # | Question | Decision |
|---|---|---|
| 1 | Cardinality | One client → many delegates. `ProjectDelegate.userId` stays `@unique` (one delegate ↔ one client) for now. Multi-client delegates = future (drop `@unique`). |
| 2 | Scope | **By-project** delegation (no "all projects" blanket). |
| 3 | Magic link | Task-scoped magic link **required** (main use: let contractor on site + report progress). |
| 4 | Default permissions | `scanQr=true`, `chat=true`, `reportProgress=true`, `viewBudget=false`, `controlFinancials=false`. No financial control out of the box. |
| 5 | Self-invite guard | A client may not invite themselves (nor a pro invite themselves). If the invitee email is already on the platform it must be a `project_delegate` (client) / `worker` (pro). |
| 6 | Invite delivery | Email-only for now. WhatsApp (cold-message template) and SMS (sender-ID) are later, additive enhancements. |
| — | Future roles | Landlord / PM / Mimo-PM share the same shape (additive `actorType` + permission template). Estate agent = separate read-only "records share" (deferred). |

---

## 2. Architecture (mirror the worker flow)

The worker flow is two independent layers. We replicate both for delegates:

```
Layer 1 (link):        Client ──invite──▶ Delegate           → DelegateInvite  (email → register → link)
Layer 2 (access):      Client ──grant──▶ Delegate on project → ProjectAccessGrant (per-project, task-scoped)
```

**Phase A1 (this doc) = Layer 1 only.** Phase A2 (Layer 2) and A3 (permission wiring) follow.

### Forward-compatibility hedge (important)

Phase A2's access table is named **`ProjectAccessGrant`** and carries two columns from day one:

- `actorType` — `'delegate' | 'landlord' | 'property_manager' | 'mimo_pm'` (default `'delegate'`)
- `permissions` — JSON flags (`scanQr`, `chat`, `reportProgress`, `viewBudget`, `controlFinancials`)

This makes landlord/PM/Mimo-PM **additive enum values + permission templates**, not migrations. Phase A1 does *not* create this table yet — it's noted here so A1's invite table doesn't drift.

---

## 3. Phase A1 — the delegate link (spec)

### 3.1 Data model

New table `DelegateInvite` — mirrors `WorkerInvite`, keyed by email for not-yet-registered delegates.

#### Prisma model (`apps/api/prisma/schema.prisma`)

```prisma
model DelegateInvite {
  id               String   @id @default(cuid())
  token            String   @unique @default(cuid())
  email            String
  assistedClientId String
  relationshipType String   @default("family")
  status           String   @default("pending") // pending | accepted | revoked | expired
  name             String?
  phone            String?
  notes            String?
  expiresAt        DateTime
  acceptedAt       DateTime?
  delegateUserId   String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  assistedClient User   @relation("DelegateInviteAssistedClient", fields: [assistedClientId], references: [id], onDelete: Cascade)
  delegateUser   User?  @relation("DelegateInviteDelegateUser", fields: [delegateUserId], references: [id], onDelete: SetNull)

  @@index([assistedClientId])
  @@index([status])
}
```

Add two back-relations to `User`:

```prisma
model User {
  // ...existing fields...
  delegateInvitesSent     DelegateInvite[] @relation("DelegateInviteAssistedClient")
  delegateInvitesReceived DelegateInvite[] @relation("DelegateInviteDelegateUser")
}
```

#### SQL DDL (`MANUAL_SQL_ADD_DELEGATE_INVITE.sql`, idempotent)

```sql
CREATE TABLE IF NOT EXISTS "DelegateInvite" (
  "id"               TEXT NOT NULL,
  "token"            TEXT NOT NULL,
  "email"            TEXT NOT NULL,
  "assistedClientId" TEXT NOT NULL,
  "relationshipType" TEXT NOT NULL DEFAULT 'family',
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "name"             TEXT,
  "phone"            TEXT,
  "notes"            TEXT,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "acceptedAt"       TIMESTAMP(3),
  "delegateUserId"   TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DelegateInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DelegateInvite_token_key" ON "DelegateInvite"("token");
CREATE INDEX IF NOT EXISTS "DelegateInvite_assistedClientId_idx" ON "DelegateInvite"("assistedClientId");
CREATE INDEX IF NOT EXISTS "DelegateInvite_status_idx" ON "DelegateInvite"("status");

ALTER TABLE "DelegateInvite"
  DROP CONSTRAINT IF EXISTS "DelegateInvite_assistedClientId_fkey";
ALTER TABLE "DelegateInvite"
  ADD CONSTRAINT "DelegateInvite_assistedClientId_fkey"
  FOREIGN KEY ("assistedClientId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DelegateInvite"
  DROP CONSTRAINT IF EXISTS "DelegateInvite_delegateUserId_fkey";
ALTER TABLE "DelegateInvite"
  ADD CONSTRAINT "DelegateInvite_delegateUserId_fkey"
  FOREIGN KEY ("delegateUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

> ⚠️ Note: the existing `MANUAL_SQL_ADD_WORKER_INVITE.sql` DDL and the current Prisma `WorkerInvite` model have drifted (the DDL lacks `name/phone/trades/notes` and references a legacy `"Worker"` table). Base `DelegateInvite` on the **Prisma model above**, not on the stale SQL.

---

### 3.2 Backend

New module `apps/api/src/delegates/`:

| File | Purpose |
|---|---|
| `delegate-invites.service.ts` | `createInvite`, `listInvites`, `listDelegates`, `revokeInvite`, `resolveInvite`, `acceptInvite` |
| `delegate-invites.controller.ts` | Routes below |
| `delegates.module.ts` | Wire service + controller |

Register `DelegatesModule` in `apps/api/src/app.module.ts`.

#### Endpoint contracts

Guard for client routes: `@UseGuards(AuthGuard('jwt'))` — `req.user.id` resolves to the **client's `User.id`** via `jwt.strategy.ts` (client role → User.id).

| Method | Path | Auth | Body / notes |
|---|---|---|---|
| `POST` | `/client/delegate-invites` | jwt | `{ email, relationshipType?, name?, phone?, notes? }` → `{ invite, inviteUrl }` (7-day TTL) |
| `GET` | `/client/delegate-invites` | jwt | list invites for `req.user.id` |
| `GET` | `/client/delegates` | jwt | list **active** `ProjectDelegate` rows where `assistedClientId = req.user.id` (joined to `User` for name/email) |
| `POST` | `/client/delegate-invites/:id/revoke` | jwt | set `status='revoked'` (owner-checked) |
| `GET` | `/delegate-invites/:token` | public | `{ email, assistedClientId, client:{firstName,surname,email}, relationshipType, isRegisteredDelegate }` |
| `POST` | `/delegate-invites/:token/accept` | public | body `{ email }`; look up delegate `User` by email (must be `project_delegate`); upsert `ProjectDelegate` + mark invite accepted |

#### `acceptInvite` logic (the critical link)

```
1. find DelegateInvite by token; require status 'pending' and not expired
2. look up User by email (body); require role === 'project_delegate' (else reject)
3. upsert ProjectDelegate:
     where userId = delegateUser.id
     create { userId, assistedClientId: invite.assistedClientId, relationshipType }
   (this fixes the self-referential assistedClientId placeholder)
4. update DelegateInvite → status 'accepted', acceptedAt, delegateUserId
```

---

### 3.3 Frontend

| File | Purpose |
|---|---|
| `apps/web/src/components/delegate-manager.tsx` | New — mirrors `worker-team-manager.tsx`: list active delegates + invites, invite-by-email, copy link, revoke. |
| `apps/web/src/app/join-delegate/page.tsx` | New — mirrors `join-worker/page.tsx`: resolve token → register (`role='project_delegate'`) → accept → redirect. |
| `apps/web/src/app/profile/page.tsx` | Add a "Delegates" section (gated to `user.role === 'client'`) embedding `DelegateManager`. |
| `apps/web/src/app/admin/people/[personaId]/page.tsx` | *(optional, later)* — show/edit the delegate's assisted client in admin. |

#### `join-delegate` flow (mirror `worker-project-access`: login **or** register)

```
1. read ?token=
2. GET /delegate-invites/:token → { email, client name, isRegisteredDelegate }
3. if isRegisteredDelegate → show login; else → show register (role 'project_delegate')
4. POST /delegate-invites/:token/accept  (body { email })
5. router.replace('/project-delegate')
```

---

### 3.4 Validation rules

1. **Self-invite guard** — `createInvite` rejects when `email` equals the inviting client's own email.
2. **Role filter (on-platform)** — if `email` already matches a `User`:
   - client invite → that user must be `role === 'project_delegate'`, else reject ("already on the platform as a non-delegate").
   - (pro invite → existing worker flow already requires `professionType === 'worker'` at accept; mirror this.)
3. **Not on platform** → send magic link; they register as `project_delegate` on the landing page.
4. Open question (defer): an existing **client** email that wants to *also* delegate — currently rejected by rule 2; revisit the role semantics later.

---

## 4. Backfill

Existing `ProjectDelegate` rows are self-referential (`assistedClientId = userId`). For the one live delegate, correct it manually once the real client id is known:

```sql
UPDATE "ProjectDelegate"
SET "assistedClientId" = '<real-client-user-id>',
    "updatedAt" = NOW()
WHERE "userId" = '<delegate-user-id>';
```

---

## 5. Testing checklist (A1)

1. Client invites by email → invite appears in panel, link copyable.
2. Open `/join-delegate?token=…` → resolves with client name shown.
3. Register as delegate → accept → `ProjectDelegate.assistedClientId` now = client (verify in SQL).
4. Delegate's `/profile` "Assisting" row now shows the **client's** name (not self).
5. Revoke + expired + already-accepted invite paths return correct errors.
6. `GET /client/delegates` lists the delegate after accept.

---

## 6. Out of scope (future phases)

- **Phase A2** — `ProjectAccessGrant` (project-scoped delegation, `actorType` + `permissions`), `DelegateAccessModal`, `delegate-project/:projectId`, magic link `action='delegate_project_access'`.
- **Phase A3** — wire `scanQr`/`chat`/`reportProgress` into site-inspection QR + project chat via a `resolveDelegateActor` analog of `resolveWorkerActor`.
- **Landlord / Property Manager / Mimo-PM** — additive `actorType` values + permission templates (no migration needed).
- **Estate agent** — separate read-only "records share".
- **Financial control** — never for delegates; future for landlord/Mimo-PM only.
