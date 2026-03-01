# Fitout Hub CFO Budget Sheet (HK$)

Date: 2026-03-01  
Currency: HKD  
FX assumption: 1 USD = HK$7.8

## 1) Executive Summary

This sheet gives a practical monthly operating budget for current stack services used by the platform:
- Vercel (web hosting + team seats)
- Supabase (database)
- Render (API hosting)
- Resend (transactional email)
- Cloudflare (R2 + CDN + DNS)
- Twilio (WhatsApp primary + SMS fallback)
- Other tooling buffer (monitoring, incident tools, misc)

## 2) Monthly Budget Scenarios (HK$)

| Service | Lean (MVP Prod) | Base (Team Upscale) | Scale (Growth) | Notes |
|---|---:|---:|---:|---|
| Vercel | 0 | 468 | 780 | 0 on hobby; Pro estimated at ~HK$156 per user/month |
| Supabase | 195 | 195 | 390 | Pro baseline; scale assumes upgraded compute/add-ons |
| Render (API) | 55 | 195 | 390 | Starter vs stronger always-on plan(s) |
| Resend | 0 | 156 | 312 | Free tier then Pro-level sending |
| Cloudflare (R2/CDN/DNS) | 40 | 120 | 390 | Storage + egress + request growth |
| Twilio (WhatsApp + SMS) | 240 | 620 | 1,800 | Driven by messaging volume |
| Other tooling buffer | 0 | 156 | 390 | Monitoring/logging/ops tools reserve |
| **Subtotal** | **530** | **1,910** | **4,452** | |
| **Contingency (15%)** | **80** | **287** | **668** | CFO buffer for usage variance |
| **Total per month** | **610** | **2,197** | **5,120** | Recommended planning number |

## 3) Annualized View (HK$)

| Scenario | Monthly Total | Annual Total |
|---|---:|---:|
| Lean | 610 | 7,320 |
| Base | 2,197 | 26,364 |
| Scale | 5,120 | 61,440 |

## 4) Messaging Sensitivity (Twilio only, HK$)

Assumes WhatsApp primary and small SMS fallback. This is the main variable cost driver.

| Monthly Notification Volume | Estimated Twilio Spend |
|---:|---:|
| 3,000 | 180 to 320 |
| 10,000 | 520 to 950 |
| 30,000 | 1,450 to 2,700 |

## 5) Suggested CFO Planning Target

For current stage (HK market, team upscaling, cost-sensitive), set operating budget target to:

- **Primary target: HK$2,200 per month** (Base scenario)
- **Approved ceiling: HK$2,800 per month** (Base + demand spikes)

This gives room for notification growth and team productivity without overcommitting too early.

## 6) Assumptions & Caveats

- Vendor pricing changes periodically; revalidate every quarter.
- Twilio country routing, template categories, and conversation windows can shift effective cost.
- Cloudflare R2 spend depends heavily on media traffic/egress profile.
- Vercel cost depends on number of paid users and build/runtime usage.

## 7) 90-Day Cost Control Actions

1. Set monthly spend alerts in Twilio, Supabase, Vercel, Cloudflare.
2. Tag notifications by eventType to track ROI by workflow.
3. Review message template quality weekly to reduce failed/duplicate sends.
4. Keep WhatsApp as primary; use SMS only as fallback or critical failover.
5. Re-forecast after first full 30 days of production usage.
