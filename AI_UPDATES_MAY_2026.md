# AI Updates - May 2026

## Scope
This document captures the recent AI consultation and booking flow updates implemented across API and web.

## Completed Updates

### 1) AI scope workflow foundation
- Added scope workflow states and operations for draft/review/publish/revise/reorder.
- Added role-based visibility and workflow actions.
- Added audit-friendly history handling for scope versions.

### 2) Search flow consultation entry
- Added Let’s talk CTA in AI search flow.
- Added complex-project advisory path.
- Added guest intermediary modal with two options:
  - Quick booking
  - Join/login

### 3) Consultation booking integration
- Reused existing assist booking modal for 30-minute consultation booking.
- Added logged-in booking path with metadata capture.
- Added guest booking path with lightweight prospective profile creation.

### 4) Guest anti-impersonation controls
- Added guest precheck endpoint:
  - POST /assist-requests/ai-consultation/precheck
- Enforced checks against existing credentials before stage-2 booking:
  - Email field check against user email
  - Mobile check with HK normalization (with and without +852 prefix)
- If conflict found, user is prompted to login to continue.

### 5) Contact-channel gating
- Added no-mobile, no-WhatsApp behavior in booking modal.
- WhatsApp option is greyed out and disabled when mobile is unavailable.
- Added clear helper text to explain why WhatsApp is disabled.

### 6) Persistence and reporting
- Extended consultation-related metadata persistence:
  - bookingChannel
  - leadLifecycleAtBooking
  - consultationDurationMin
  - contactEmailSnapshot
  - contactMobileSnapshot
- Added prospective lifecycle/lead event logging for consultation funnel analytics.
- Added admin report endpoint and analytics display for consultation funnel metrics.

### 7) Stability and deployment fixes
- Fixed multiple TypeScript build blockers discovered on Render/Vercel, including:
  - Nullability mismatch for contact snapshots
  - Missing import and type shape mismatches
  - Unreachable branch causing never-type inference
  - User interface typing for mobile on web auth context
- Fixed stale pending-assist token behavior causing booking modal auto-open during new AI thinking cycles.

## Current Behavior (Verified in Code)
- Guest users cannot proceed to booking stage 2 if submitted email/mobile already exists in system.
- Existing user identification uses email field (not username).
- HK mobile matching works with and without +852 prefix.
- WhatsApp booking option is unavailable when no mobile is present.
- Pending assist draft token is flushed on new AI prompt, clear/reset flows, and home reset path to prevent stale modal popups.

## Follow-up Notes
- AI workstream is paused for now and can be resumed from this checkpoint.
- If needed next: add TTL expiry for pending assist draft token as an additional safety guard.
