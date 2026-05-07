# RLS Policy Checklist

Use this checklist whenever a new table is added (or an existing table gets a new access path).

## Scope

This checklist applies to all tables in `public` schema exposed through PostgREST/Supabase.

## 1. Migration Planning

- [ ] Identify whether the new table is:
  - [ ] Lookup/reference (safe read-only)
  - [ ] Operational/business data
  - [ ] Security-sensitive/system data (OTP, tokens, audit, challenges)
- [ ] Define required actors:
  - [ ] `service_role`
  - [ ] Admin users
  - [ ] Authenticated client users
  - [ ] Authenticated professionals
  - [ ] Anonymous users (if any)
- [ ] Document allowed operations per actor (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).

## 2. Required SQL Changes (Same Release)

- [ ] Ensure RLS is enabled for the table.
- [ ] Add/confirm `service_role` policy (`p0_service_role_all`) where needed.
- [ ] Add explicit app policies for each allowed actor/path.
- [ ] Keep deny-by-default for everything not explicitly allowed.
- [ ] Avoid blanket admin policy on security-sensitive/system tables.

## 3. Policy Design Rules

- [ ] Use least privilege (minimum operations and minimum row scope).
- [ ] Prefer ownership checks (`userId`, `professionalId`, project membership) over broad access.
- [ ] Use explicit `WITH CHECK` rules for writes.
- [ ] Use deterministic policy names (example: `p2_admin_crud`, `p3_admin_read_only`).
- [ ] Make scripts idempotent (`DROP POLICY IF EXISTS` before `CREATE POLICY`, or guarded create).

## 4. Verification (SQL)

- [ ] Run verification query (policy count and app policy coverage).
- [ ] Confirm no unexpected tables appear in "missing app-level policy" output.
- [ ] Confirm expected holdouts remain locked (if intentional).

## 5. Runtime Smoke Test (Post-Deploy)

- [ ] Client login + key client flows work.
- [ ] Professional login + key professional flows work.
- [ ] Admin pages and expected admin actions work.
- [ ] Service-role backend jobs/endpoints still work.
- [ ] Render/API logs show no new RLS permission spikes (`401/403/permission denied`).

## 6. Rollback Readiness

- [ ] Create rollback SQL for new policy layer(s).
- [ ] Confirm rollback only removes intended policies/functions.
- [ ] Keep rollback script with migration artifacts for the same release.

## 7. Ongoing Rule

- [ ] Every new table/change in `public` must include policy updates in the same migration/release.
- [ ] Re-run verification after each schema update.

## Current Project Scripts

- `ENABLE_RLS_ON_PUBLIC_TABLES.sql`
- `PHASE_A_BASELINE_RLS_POLICIES.sql`
- `PHASE_A1_ADMIN_CRUD_POLICIES.sql`
- `PHASE_A1_ADMIN_CRUD_POLICIES_ROLLBACK.sql`
- `PHASE_A2_REMAINING_ADMIN_POLICIES.sql`
