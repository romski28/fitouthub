# Local Dev Diagnosis

Date: 2026-05-19

## Summary

The local dev site is not primarily broken because of XAMPP.

- The web app boots locally.
- The API source compiles locally after regenerating Prisma.
- The main blocker is that the API `start:dev` runner is out of sync with the actual build output path.

## What Was Verified

### Web app

- Command: `pnpm --filter web dev`
- Result: boots successfully on `http://localhost:3000`
- Config source: `apps/web/.env.local`

The frontend fallback API base URL already points local browser traffic to `http://localhost:3001/api` when running on localhost.

Relevant file:

- `apps/web/src/config/api.ts`

### API app

- Expected port from source: `3001`
- Config source: `apps/api/.env`

Relevant file:

- `apps/api/src/main.ts`

## First Failure Found

The API initially failed in local dev watch mode because Prisma client types were stale.

Observed error:

- `quoteBreakdown` was not present in generated Prisma types
- this blocked compile in `apps/api/src/projects/projects.service.ts`

Non-destructive fix that worked:

```powershell
pnpm --filter api exec prisma generate
```

After that, the API compiled cleanly.

## Remaining Failure

After Prisma regeneration, `pnpm --filter api start:dev` still failed.

Command:

```powershell
pnpm --filter api start:dev
```

Observed behavior:

- TypeScript watch compile succeeded
- runtime then crashed trying to load:

```text
apps/api/dist/main
```

Observed error:

```text
Error: Cannot find module 'C:\Xampp_webserver\htdocs\renovation-platform\apps\api\dist\main'
```

## Root Cause

The API dev runner expects the old single-project output shape, but the actual build emits nested monorepo-style output.

### Current scripts

From `apps/api/package.json`:

- `build`: `nest build`
- `start:dev`: `nest start --watch`
- `start:prod`: `node dist/apps/api/src/main.js`

This already shows the inconsistency:

- `start:prod` knows the actual built entrypoint path
- `start:dev` still assumes the default Nest output path

### Actual emitted output

The API build produces:

```text
apps/api/dist/apps/api/src/main.js
```

not:

```text
apps/api/dist/main.js
```

## Important Conclusion

The app itself is not fundamentally broken locally.

This was verified by running the actual built entrypoint directly:

```powershell
node apps/api/dist/apps/api/src/main.js
```

Result:

- Nest bootstrapped successfully
- routes were registered
- the API got substantially further than the broken `start:dev` path

So the problem is not primarily:

- XAMPP
- Next.js frontend local boot
- application compile after Prisma regenerate

The problem is:

- API dev runner path mismatch

## Current Non-Destructive Workaround

If local visual review is needed before fixing dev hot reload properly:

1. Regenerate Prisma client when schema changes:

```powershell
pnpm --filter api exec prisma generate
```

2. Build the API:

```powershell
pnpm --filter api build
```

3. Run the built API directly:

```powershell
node apps/api/dist/apps/api/src/main.js
```

4. In another terminal, run the web app:

```powershell
pnpm --filter web dev
```

This is not full API hot reload, but it avoids having to commit and push every UI change for inspection.

## Recommended Fix Later

Lowest-risk approach:

- fix the API dev runner to use the real output path
- do not try to rework the full compiler output layout unless necessary

Reason:

- this is a narrow script/config mismatch
- it is much lower risk than changing TypeScript or Nest monorepo output behavior

Recommended direction:

1. Update the local API dev workflow so the watched runtime launches the actual emitted file.
2. Avoid broad changes to `tsconfig` or build layout unless the minimal script fix fails.

## Risk Assessment

- Low risk: minimal dev-runner fix
- Moderate risk: changing compiler output structure
- High and unnecessary risk: broad build-system cleanup without need

## Is It Worth Fixing?

Yes.

If local dev is down for about 30 minutes per day, that is roughly:

- 2.5 hours per week
- about 10 hours per month

Even a 1 to 3 hour one-time fix pays back quickly if the project is still under active UI iteration.

## Relevant Files

- `apps/web/src/config/api.ts`
- `apps/web/.env.local`
- `apps/api/.env`
- `apps/api/src/main.ts`
- `apps/api/package.json`
- `apps/api/tsconfig.json`
- `apps/api/nest-cli.json`
- `apps/api/dist/apps/api/src/main.js`