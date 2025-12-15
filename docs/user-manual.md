# FitoutHub User Manual

## Overview
- Collect renovation project requests (projects) and manage professionals/companies/resellers (professionals).
- Admin views for reviewing data and patterns; REST API backing the frontend.

## Access
- Web (Vercel): Admin pages and frontend UI.
- API (Render): https://fitouthub.onrender.com

## Admin Login
- Use your provided admin credentials. If auth is disabled, admin lists are read-only.

## Admin Features
- Professionals: list, filter, view detail.
- Projects: list, view detail.
- Users: list (once API route is live after deploy).
- Patterns: core + DB patterns (after migration runs).

## API (Render)
Base URL: https://fitouthub.onrender.com
- GET /projects — list projects
- GET /projects/:id — project detail
- GET /projects/:id/professionals — linked professionals
- GET /tradesmen — reference trades
- GET /professionals — list professionals (filters supported)
- GET /users — list users (after deploy)
- GET /patterns?includeCore=true — core + DB patterns (after migration)
- Auth (if enabled): POST /auth/login, POST /auth/register

## Environment Config
- Frontend (Vercel): NEXT_PUBLIC_API_BASE_URL=https://fitouthub.onrender.com
- API (Render): DATABASE_URL with pooler port 5432 and pgbouncer params; JWT_SECRET, JWT_REFRESH_SECRET, RESEND_API_KEY, BASE_URL
- Local: API pnpm start:dev (3001), Web pnpm dev (3000), NEXT_PUBLIC_API_BASE_URL=http://localhost:3001

## Data Notes
- Seeded projects and professionals exist; patterns include mapsTo column.
- Core patterns are hardcoded; DB patterns are stored in Prisma Pattern table.
- Tradesmen is reference data for professions.

## Common Tasks
- Run API locally: cd apps/api && pnpm start:dev
- Run Web locally: cd apps/web && pnpm dev
- Run migrations locally: cd apps/api && pnpm exec prisma migrate deploy
- Seed (if needed): pnpm run seed:professionals, pnpm run seed:patterns (apps/api)

## Troubleshooting
- Patterns/Users 404 on Render: redeploy with migrations (pnpm --filter=api exec prisma migrate deploy during build).
- DB connection issues: use pooler host/port 5432 with pgbouncer=true&connection_limit=1.
- Missing module on Render: ensure pnpm install runs at root before build.

## How to Publish Docs
- This file lives at docs/user-manual.md.
- The frontend /docs page links here for easy access.
