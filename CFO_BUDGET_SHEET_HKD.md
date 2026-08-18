# Mimo Platform CFO Budget Sheet (HK$)

> Formerly "Fitout Hub CFO Budget Sheet" — rebrand to Mimo in progress.

Date: 2026-08-17  
Currency: HKD  
FX assumption: 1 USD = HK$7.8

## 1) Executive Summary

This sheet gives a practical monthly operating budget for the services used by the platform:
- Vercel (web hosting + team seats)
- Supabase (database)
- Render (API hosting)
- Resend (transactional email)
- Cloudflare (R2 + CDN + DNS)
- Twilio (WhatsApp primary + SMS fallback)
- Expo / EAS (mobile builds, when production app work starts)
- AI models (DeepSeek chat + Qwen vision — platform runtime)
- AI coding tools (developer assistant — DeepSeek + GitHub Copilot)
- GitHub (source control + CI)
- Google Maps (free credit first, then usage-based)
- Stripe (per-transaction — not a fixed monthly cost)
- Other tooling buffer (monitoring, incident tools, misc)

## 1a) Which accounts to formalise as paid

**Upgrade now (compliance / operational):**
- **Vercel Pro** — Hobby tier forbids commercial use, and team seats are required for shared multi-device access. ≈ HK$156/user/month.
- **Supabase Pro** — free projects pause after 7 days of inactivity and lack daily backups; prod must not pause. ≈ HK$195/project/month (dev project can stay free).
- **Render paid always-on instance** — free API spins down after 15 min idle (cold starts). ≈ HK$55/instance/month.

**Upgrade when the trigger hits:**
- **Resend Pro** — when email exceeds ~3,000/month. ≈ HK$156/month.
- **Expo / EAS paid** — when the mobile app needs production builds + push. ≈ HK$226/month.
- **GitHub Team** — only if extra CI minutes / required reviewers are needed. ≈ HK$31/user/month.

**Pay-as-you-go (enable billing, no fixed tier):** Stripe (per transaction, HK ~3.4% + HK$2.35 domestic), Twilio (per message), DeepSeek + Qwen (per token), Google Maps (HK$1,560/month free credit first), Cloudflare R2 (free tier then per GB).

**Developer tooling (separate from the platform's runtime AI):** DeepSeek coding assistant ≈ HK$156/user/month; GitHub Copilot Pro ≈ HK$78/user/month (Copilot Free is $0). Carried as its own budget line because the developer will use it daily.

## 2) Monthly Budget Scenarios (HK$)

| Service | Lean (MVP Prod) | Base (Team Upscale) | Scale (Growth) | Notes |
|---|---:|---:|---:|---|
| Vercel | 156 | 468 | 780 | Pro ≈ HK$156/user/month; commercial use requires Pro (1 / 3 / 5 seats) |
| Supabase | 195 | 195 | 390 | Prod on Pro (≈HK$195/project); dev stays free; scale adds compute/add-ons |
| Render (API) | 55 | 195 | 390 | Always-on Starter ≈ HK$55; scale = stronger/multiple instances |
| Resend | 0 | 156 | 312 | Free tier, then Pro ≈ HK$156/month |
| Cloudflare (R2/CDN/DNS) | 40 | 120 | 390 | Storage + requests + growth |
| Twilio (WhatsApp + SMS) | 240 | 620 | 1,800 | Driven by messaging volume |
| Expo / EAS (mobile) | 0 | 0 | 226 | Only when production app builds + push start (≈ HK$226/month) |
| AI models (DeepSeek + Qwen) | 78 | 156 | 468 | Platform runtime AI — usage-based token cost; planning buffer only |
| AI coding tools (DeepSeek + Copilot) | 156 | 234 | 468 | Dev assistant: DeepSeek ≈ HK$156 + Copilot Pro ≈ HK$78 per user (1 / 1 / 2 users) |
| GitHub | 0 | 0 | 156 | Free is sufficient; Team ≈ HK$31/user/month if needed |
| Other tooling buffer | 0 | 156 | 390 | Monitoring/logging/ops tools reserve |
| **Subtotal** | **920** | **2,300** | **5,770** | |
| **Contingency (15%)** | **138** | **345** | **866** | CFO buffer for usage variance |
| **Total per month** | **1,058** | **2,645** | **6,636** | Recommended planning number |

## 3) Annualized View (HK$)

| Scenario | Monthly Total | Annual Total |
|---|---:|---:|
| Lean | 1,058 | 12,696 |
| Base | 2,645 | 31,740 |
| Scale | 6,636 | 79,632 |

## 4) Messaging Sensitivity (Twilio only, HK$)

Assumes WhatsApp primary and small SMS fallback. This is the main variable cost driver.

| Monthly Notification Volume | Estimated Twilio Spend |
|---:|---:|
| 3,000 | 180 to 320 |
| 10,000 | 520 to 950 |
| 30,000 | 1,450 to 2,700 |

## 5) Suggested CFO Planning Target

For current stage (HK market, team upscaling, cost-sensitive), set operating budget target to:

- **Primary target: HK$2,600 per month** (Base scenario)
- **Approved ceiling: HK$3,200 per month** (Base + demand spikes)

This gives room for notification growth and team productivity without overcommitting too early.

## 6) Assumptions & Caveats

- Vendor pricing changes periodically; revalidate every quarter (figures are indicative, not quotes).
- Vercel Hobby tier is **not** compliant for commercial use — treat Pro as mandatory, not optional.
- Supabase free projects pause after 7 days of inactivity — prod must be on Pro.
- Render free instances cold-start after idle — plan for a paid always-on instance in prod.
- Twilio country routing, template categories, and conversation windows can shift effective cost.
- Cloudflare R2 spend depends heavily on media traffic/egress profile.
- Platform AI (DeepSeek/Qwen) is usage-based; the budget line is a planning buffer, not a fixed fee.
- AI coding tools (DeepSeek assistant + GitHub Copilot) are separate developer subscriptions — distinct from the platform's runtime AI.
- Expo/EAS and GitHub are carried at $0 until the mobile production-build / team-CI trigger.
- Stripe is excluded from the monthly table because it scales with transaction revenue, not fixed overhead.

## 7) 90-Day Cost Control Actions

1. Set monthly spend alerts in Twilio, Supabase, Vercel, Cloudflare, DeepSeek/Qwen.
2. Tag notifications by eventType to track ROI by workflow.
3. Review message template quality weekly to reduce failed/duplicate sends.
4. Keep WhatsApp as primary; use SMS only as fallback or critical failover.
5. Re-forecast after first full 30 days of production usage.
