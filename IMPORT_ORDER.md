# Database Import Order (FK-Safe)

Import tables in this exact order to avoid foreign key violations.

## Level 0 - No dependencies
1. `Tradesman` (no FK to other app tables)
2. `AnonymousChatThread` (no FK to other app tables)
3. `NextStepConfig` (no FK to other app tables)
4. `AdminNextStepTemplate` (no FK to other app tables)
5. `Policy` (no FK to other app tables)

## Level 1 - Depends only on Level 0
6. `User` (no FK to other app tables; Professional relation is NOT a FK on User side)
7. `MilestoneTemplate` (FK: tradeId → Tradesman)
8. `ServiceMapping` (FK: tradeId → Tradesman)
9. `AnonymousChatMessage` (FK: threadId → AnonymousChatThread)

## Level 2 - Depends on Level 1
10. `Professional` (FK: userId → User)
11. `NotificationPreference` (FK: userId → User OR professionalId → Professional)

## Level 3 - Depends on Level 2
12. `Project` (FK: userId → User, clientSignedById → User, professionalSignedById → User)
13. `EmailToken` (FK: professionalId → Professional, projectId → Project)
14. `ProfessionalReport` (FK: professionalId → Professional)
15. `ProfessionalReferenceProject` (FK: professionalId → Professional)
16. `PrivateChatThread` (FK: userId → User OR professionalId → Professional)
17. `ActivityLog` (FK: userId → User OR professionalId → Professional)
18. `NotificationLog` (FK: userId → User OR professionalId → Professional)

## Level 4 - Depends on Level 3
19. `ProjectPhoto` (FK: projectId → Project)
20. `ProjectProfessional` (FK: projectId → Project, professionalId → Professional)
21. `ProjectAssistRequest` (FK: projectId → Project, userId → User)
22. `ProjectChatThread` (FK: projectId → Project)
23. `SiteAccessData` (FK: projectId → Project, submittedBy → User, lastUpdatedBy → User)
24. `ProjectLocationDetails` (FK: projectId → Project, submittedBy → User, reviewedBy → User)
25. `NextStepAction` (FK: projectId → Project, userId → User)
26. `AdminAction` (FK: projectId → Project, assignedToAdminId → User, completedByAdminId → User)
27. `PrivateChatMessage` (FK: threadId → PrivateChatThread, senderUserId → User, senderProId → Professional)

## Level 5 - Depends on Level 4
28. `ProjectMilestone` (FK: projectId → Project, projectProfessionalId → ProjectProfessional, templateId → MilestoneTemplate)
29. `Message` (FK: projectProfessionalId → ProjectProfessional)
30. `PaymentRequest` (FK: projectProfessionalId → ProjectProfessional)
31. `FinancialTransaction` (FK: projectId → Project, projectProfessionalId → ProjectProfessional)
32. `SiteAccessRequest` (FK: projectId → Project, projectProfessionalId → ProjectProfessional, professionalId → Professional, clientApprovedBy → User)
33. `SiteAccessVisit` (FK: projectId → Project, projectProfessionalId → ProjectProfessional, professionalId → Professional, respondedBy → User)
34. `ProjectChatMessage` (FK: threadId → ProjectChatThread)
35. `AssistMessage` (FK: assistRequestId → ProjectAssistRequest)

## Level 6 - Depends on Level 5
36. `EscrowLedger` (FK: projectId → Project, projectProfessionalId → ProjectProfessional, transactionId → FinancialTransaction)

## Special Cases / Circular Dependencies
- **Project.approvedBudgetTxId** → FinancialTransaction (import Project first without this FK, then update after FinancialTransaction is loaded)
- **Project.awardedProjectProfessionalId** → ProjectProfessional (import Project first without this FK, then update after ProjectProfessional is loaded)
- **FinancialTransaction.approvedBudgetProject** → Project (handled by above)

---

## Step-by-Step Migration Process

### Prerequisites
1. **Create schema in NEW DB first (ONE TIME ONLY):**
   ```bash
   cd apps/api
   pnpm prisma migrate deploy
   ```
   This creates all 36 tables with full FK constraints. You only do this ONCE before importing any data.

2. **Verify schema created:**
   In new DB SQL Editor, run: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
   Should show 36+ tables.

### Export/Import Data for Each Table

For each table in Level order (1-36), export DATA ONLY from old DB and import to new DB.

**Method 1: Supabase SQL Editor (Recommended)**

**Export data from OLD DB:**
```sql
-- Example for Tradesman table (Level 0, #1)
SELECT * FROM "Tradesman";
```
Copy result → Save as CSV or use Table Editor Export feature

**Import data to NEW DB:**
```sql
-- Tables already exist from Prisma migrations, just insert data
COPY "Tradesman" FROM STDIN WITH CSV HEADER;
-- Paste CSV rows here, then click Run
```

OR use INSERT statements if you prefer:
```sql
INSERT INTO "Tradesman" (id, title, category, ...) VALUES
('id1', 'Plumber', 'trades', ...),
('id2', 'Electrician', 'trades', ...);
```

**Method 2: pg_dump/psql (if CLI tools available)**
```bash
# Export single table DATA ONLY (no schema)
pg_dump -h old_host -U postgres -d postgres -t "Tradesman" --data-only --column-inserts > tradesman_data.sql

# Import to new DB (tables already exist from Prisma)
psql -h new_host -U postgres -d postgres < tradesman_data.sql
```

**Method 3: Supabase Table Editor UI**
- Open old DB → Table Editor → click table → select all rows → right-click → Export → SQL inserts
- Copy INSERT statements
- Open new DB → SQL Editor → paste INSERT statements → Run

---

## Complete Migration Checklist

- [ ] **Step 1:** Run `pnpm prisma migrate deploy` in new DB (creates all tables)
- [ ] **Step 2:** Import data for Level 0 tables (1-5): Tradesman, AnonymousChatThread, NextStepConfig, AdminNextStepTemplate, Policy
- [ ] **Step 3:** Import data for Level 1 tables (6-9): User, MilestoneTemplate, ServiceMapping, AnonymousChatMessage
- [ ] **Step 4:** Import data for Level 2 tables (10-11): Professional, NotificationPreference
- [ ] **Step 5:** Import data for Level 3 tables (12-18): Project, EmailToken, ProfessionalReport, etc.
- [ ] **Step 6:** Import data for Level 4 tables (19-27): ProjectPhoto, ProjectProfessional, SiteAccessData, etc.
- [ ] **Step 7:** Import data for Level 5 tables (28-35): ProjectMilestone, Message, PaymentRequest, FinancialTransaction, etc.
- [ ] **Step 8:** Import data for Level 6 tables (36): EscrowLedger
- [ ] **Step 9:** Run circular FK fix script (see below)
- [ ] **Step 10:** Run sequence reset script (see below)
- [ ] **Step 11:** Run FK integrity verification (see below)
- [ ] **Step 12:** Test application with new DB

---

## After All Imports Complete

### 1) Fix circular FKs for Project table
```sql
-- Update Project.approvedBudgetTxId where needed
UPDATE "Project" p
SET "approvedBudgetTxId" = ft.id
FROM "FinancialTransaction" ft
WHERE ft."projectId" = p.id
  AND ft.type = 'approved_budget'
  AND p."approvedBudgetTxId" IS NULL;

-- Update Project.awardedProjectProfessionalId where needed
UPDATE "Project" p
SET "awardedProjectProfessionalId" = pp.id
FROM "ProjectProfessional" pp
WHERE pp."projectId" = p.id
  AND pp.status = 'awarded'
  AND p."awardedProjectProfessionalId" IS NULL;
```

### 2) Reset all SERIAL/IDENTITY sequences
```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT
      c.table_schema,
      c.table_name,
      c.column_name,
      pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_default LIKE 'nextval(%'
  LOOP
    EXECUTE format(
      'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1), true);',
      r.seq_name, r.column_name, r.table_schema, r.table_name
    );
  END LOOP;
END $$;
```

### 3) Verify FK integrity
```sql
-- Check for orphaned records (should return 0 rows in all cases)
SELECT 'Professional with missing User' AS issue, COUNT(*) FROM "Professional" p
LEFT JOIN "User" u ON u.id = p."userId"
WHERE p."userId" IS NOT NULL AND u.id IS NULL;

SELECT 'Project with missing User' AS issue, COUNT(*) FROM "Project" p
LEFT JOIN "User" u ON u.id = p."userId"
WHERE p."userId" IS NOT NULL AND u.id IS NULL;

SELECT 'ProjectProfessional with missing Project' AS issue, COUNT(*) FROM "ProjectProfessional" pp
LEFT JOIN "Project" p ON p.id = pp."projectId"
WHERE p.id IS NULL;

SELECT 'ProjectProfessional with missing Professional' AS issue, COUNT(*) FROM "ProjectProfessional" pp
LEFT JOIN "Professional" pr ON pr.id = pp."professionalId"
WHERE pr.id IS NULL;

-- Add more checks as needed for other critical FKs
```

### 4) Re-enable triggers/constraints (if disabled during import)
```sql
-- Usually not needed if you import in correct order
-- But if you disabled constraints:
SET session_replication_role = 'origin';
```

---

## Troubleshooting

**Problem:** "duplicate key value violates unique constraint"
- **Solution:** Table already has some data; truncate it first: `TRUNCATE TABLE "TableName" CASCADE;`

**Problem:** "insert or update on table violates foreign key constraint"
- **Solution:** Parent table not imported yet or missing rows; check import order

**Problem:** Next inserts use duplicate IDs
- **Solution:** Sequences not reset; run sequence reset script from step 2 above
