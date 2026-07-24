# Mimo Platform — Technical Overview for Handover & Mobile Planning

**Date**: July 24, 2026  
**Purpose**: Define platform mechanics, required skills, and mobile app path for job scoping

---

## 1. Platform Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Vercel (Frontend)                     │
│  Next.js 16 App Router · React 19 · Tailwind CSS         │
│  PWA (service worker, installable) · next-intl (i18n)    │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API (JSON)
┌──────────────────────▼──────────────────────────────────┐
│                   Render (Backend)                       │
│  NestJS · Prisma ORM · PostgreSQL (Supabase)             │
│  JWT Auth · Google OAuth · DeepSeek AI · Qwen Vision     │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Supabase (Database / Auth)                   │
│  PostgreSQL · RLS · Manual SQL migrations                 │
└─────────────────────────────────────────────────────────┘
```

### Monorepo Structure
```
renovation-platform/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # NestJS backend
├── package.json      # Root workspace
└── *.sql             # Manual DB migrations (no ORM migrations)
```

### Key Constraint: No Prisma Migrations
Schema changes are applied via **manual SQL files** run on Supabase SQL Editor. Prisma schema is updated for type safety but `prisma migrate` is not used. This is a deliberate design choice.

---

## 2. Frontend (apps/web)

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS (Mimo Beige theme: coral #FF7F50, emerald-600) |
| State | React Context (auth, modal, next-step) + useState |
| Forms | Uncontrolled + controlled patterns |
| i18n | next-intl (en, zh-HK) |
| PWA | Custom service worker (sw.js), manifest.json |
| Auth | JWT tokens in localStorage, Google OAuth via GSI library |
| AI | DeepSeek chat via `/ai/sandbox/requirements/conversational` |
| Maps | Google Maps Embed API |

### Route Structure (Client-Facing)
```
/                          Home page (AI search flow)
/get-started               Client/Pro registration wizard
/create-project/wizard     AI-guided project creation wizard
/projects                  Client project list
/projects/[id]             Client project detail + tabs
/professionals             Professional directory search
/professional-projects     Pro project list (dashboard)
/professional-projects/[id] Pro project detail + tabs
/professional/profile      Pro profile management
/professional/calendar     Pro availability calendar
/admin/**                  Admin panel
```

### Key Components
| Component | Purpose |
|-----------|---------|
| `search-flow.tsx` | Home page AI search/prompt flow |
| `search-box.tsx` | Search input with voice, image upload |
| `project-tabs.tsx` | Tab system for project detail pages |
| `next-steps/` | Modal-based action system (quote, site access, contract, etc.) |
| `auth-modal.tsx` | Login/Join modal with email + Google |
| `quote-action-modal.tsx` | Quote submission/editing modal |
| `request-site-access-modal.tsx` | Site inspection booking modal |

### Key Patterns
- **Next Step System**: Server computes next actions per project → frontend renders as buttons/modals. Actions: SUBMIT_QUOTE, REQUEST_SITE_ACCESS, DECLINE_PROJECT, etc.
- **AI Wizard**: DeepSeek conversational AI gathers project requirements. Tappable answer buttons for quick replies. One question per turn.
- **PWA**: Service worker with cache-first for assets, network-first for navigation. Versioned caches (`mimo-v2`).
- **Auth Modal Control**: Context-based modal system (`useAuthModalControl`) with `openLoginModal`/`openJoinModal`.
- **Refresh Pattern**: Professional project list uses localStorage cache + visibilitychange listener for instant placeholder + manual refresh buttons.

---

## 3. Backend (apps/api)

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Framework | NestJS |
| Language | TypeScript |
| ORM | Prisma (read-only type generation) |
| Database | PostgreSQL (Supabase) |
| Auth | JWT (access + refresh tokens), Google OAuth |
| AI | DeepSeek (chat), Qwen (vision/image analysis) |
| Email | Nodemailer |
| File Upload | Multer |

### Key Modules
| Module | Purpose |
|--------|---------|
| `auth/` | Client auth (register, login, refresh, Google OAuth) |
| `professional-auth/` | Professional auth (OTP, Google OAuth) |
| `projects/` | Project CRUD, next-step calculation |
| `ai/` | AI chat, requirements extraction, image analysis |
| `professional/` | Professional profile, projects, site access |
| `financial/` | Payment plans, escrow, financial summaries |
| `site-access/` | Site inspection booking, visits, QR check-in |

### Key Patterns
- **Manual SQL**: All schema changes via `.sql` files run on Supabase. Prisma schema updated for types.
- **Next-Step Calculation**: Server-side logic in `next-step.service.ts` determines which action a pro should take next based on project status, quotes, site access, contracts, etc.
- **Dual Auth**: Separate `User` and `Professional` tables, unified under `Identity`/`Persona` system (in progress).
- **AI Intake**: Conversation logs stored in `ai_conversation_logs` for LLM training dataset.

---

## 4. Database (Supabase PostgreSQL)

### Key Tables
| Table | Purpose |
|-------|---------|
| `User` | Client accounts |
| `Professional` | Professional accounts |
| `Identity` | Unified auth identity (in migration) |
| `Persona` | Role-specific profile (in migration) |
| `Project` | Project records |
| `ProjectProfessional` | Pro-project assignments (bidding, quotes) |
| `SiteAccessRequest` | Site inspection bookings |
| `SiteAccessVisit` | Site visit records |
| `Message` | Chat messages |
| `AiIntake` | AI conversation intake records |
| `AiConversationLog` | AI training dataset |
| `FinancialTransaction` | Payment/escrow records |
| `ProjectMilestone` | Project milestones |
| `ProjectPaymentPlan` | Payment plans |

### Migration Pattern
All schema changes use `MANUAL_SQL_*.sql` files run on Supabase SQL Editor. No Prisma migrations. After running SQL, update Prisma schema for type safety, then redeploy API (Render).

---

## 5. Third-Party Services

| Service | Purpose | Config Location |
|---------|---------|----------------|
| Vercel | Frontend hosting | `vercel.json` |
| Render | API hosting | Render dashboard |
| Supabase | PostgreSQL database | Manual SQL |
| DeepSeek | AI chat/analysis | `apps/api` env vars |
| Qwen | Vision/image analysis | `apps/api` env vars |
| Google OAuth | Social login | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| Google Maps | Address display | `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` |
| Google GSI | Google sign-in button | Script loaded in auth-modal |

---

## 6. Required Skills for Ownership

### Must Have
| Skill | Why |
|-------|-----|
| **TypeScript** (advanced) | Entire codebase is TypeScript — strict typing, generics, complex types |
| **React 19 / Next.js 16** | App Router, Server/Client Components, RSC, PWA |
| **NestJS** | Backend framework — decorators, guards, modules, dependency injection |
| **Prisma ORM** | Database queries, schema management (read-only in this project) |
| **PostgreSQL** | Manual SQL, RLS, complex queries, schema design |
| **Tailwind CSS** | All styling uses Tailwind with custom theme |
| **REST API design** | Frontend-backend communication pattern |
| **JWT / OAuth 2.0** | Authentication flow, token refresh, Google OAuth |
| **Git** | Version control, monorepo management |
| **Docker** (nice-to-have) | Local development, Render deployment |

### Domain Knowledge Needed
- **Renovation/Construction workflow**: quoting, site inspection, milestones, escrow/payments
- **Hong Kong context**: locale formats (`en-HK`), address structure, trade naming
- **PWA lifecycle**: service workers, manifest, install prompts, iOS Safari quirks

### Learning Curve by Area
| Area | Effort | Notes |
|------|--------|-------|
| Frontend pages/components | Low | Standard React/Next.js patterns |
| AI prompt system | Medium | Prompt engineering, conversational flow |
| Next-step calculation | High | Complex server-side logic with many states |
| Auth (Identity/Persona) | High | Multi-role, multi-table, OAuth, session mgmt |
| Financial/escrow | High | Payment plans, escrow ledger, platform fees |
| Manual SQL migrations | Medium | No ORM migrations — manual SQL discipline |

---

## 7. Mobile App Path

### Option A: React Native (Recommended)
- **Shared language**: TypeScript/React knowledge transfers directly
- **Code sharing**: Utility functions, types, API client can be shared
- **Existing ecosystem**: React Native + Expo for fast iteration
- **Trade-off**: Native performance not as good as Swift/Kotlin for complex UI

### Option B: Flutter
- **Single codebase**: iOS + Android from one Dart codebase
- **Strong UI**: Material Design, custom painting
- **Trade-off**: No code sharing with web, new language (Dart)

### Option C: PWA Enhancement (Fastest)
- **Already a PWA**: Improve offline support, push notifications, native-feel
- **No new codebase**: Same web app, better mobile experience
- **Limitations**: No App Store presence, limited native API access

### What the API Already Provides for Mobile
The REST API is already mobile-ready:
- JWT authentication (can be used from any HTTP client)
- All endpoints return JSON
- No server-side rendering dependency
- File upload via multipart/form-data
- Real-time chat via polling (could upgrade to WebSocket)

### Mobile-Specific Additions Needed
- Push notification infrastructure (FCM/APNs)
- Native camera integration (replacing web file upload)
- Offline-first data caching
- Biometric auth (Face ID / fingerprint)
- Deep linking for notifications
- App Store / Play Store deployment pipeline

---

## 8. Current Technical Debt / Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| Google OAuth token sub mismatch | Fixed | googleStart used User.id instead of identity.id as JWT sub; refresh endpoint expected Identity ID — fixed 2026-07-24 |
| React Compiler disabled | Medium | Was `reactCompiler: true`; may need re-enabling with fixes |
| PWA iOS blank page | Medium | Fixed (opacity gate); verify after deploy |
| Manual SQL migrations | Medium | No automated migration system; discipline required |
| Dead code in page.tsx | Low | handleSubmitQuote, handleAccept, handleReject unused |
| AI prompt pending Render redeploy | Low | Rules 3,4,11-13,19 need Render redeploy |

---

## 9. Environment Variables (Key Ones)

```
# Frontend (Vercel)
NEXT_PUBLIC_API_BASE_URL=https://fitouthub.onrender.com/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...

# Backend (Render)
DATABASE_URL=postgresql://...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_CLIENT_ID=...
DEEPSEEK_API_KEY=...
QWEN_VISION_ENABLED=false
JWT_SECRET=...
```

---

## 10. Deployment Pipeline

```
Git push (main) → Vercel auto-deploy (web) + Render auto-deploy (api)
Manual SQL → Supabase SQL Editor → Prisma schema update → Render redeploy
```

**Note**: API changes need Render redeploy. Frontend changes auto-deploy on Vercel. Database changes need manual SQL on Supabase.
