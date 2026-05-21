# HK Companies Registry (CR) Open Data API — Verification Guide

Reference for integrating with the CR API for company lookups and building admin verification panels similar to the BRC (Business Registration Certificate) checker.

---

## CR API Endpoint

```
GET https://data.cr.gov.hk/cr/api/api/v1/api_builder/json/local/search
```

No API key required. Public open data.

---

## Query Parameter Format

Uses a bracket-notation array structure:

| Param | Meaning |
|---|---|
| `query[0][key1]` | Field to search (`Comp_name` or `Brn`) |
| `query[0][key2]` | Operator (`begins_with` or `equal`) |
| `query[0][key3]` | Value to search for |

### Examples

**Search by company name (begins with):**
```
?query[0][key1]=Comp_name&query[0][key2]=begins_with&query[0][key3]=MIMO WORK
```

**Search by BRN (exact match):**
```
?query[0][key1]=Brn&query[0][key2]=equal&query[0][key3]=80121820
```

> The bracket characters `[` and `]` do **not** need to be percent-encoded — the CR API accepts both raw and encoded forms.

---

## Response Behaviour

| Scenario | HTTP Status | Body |
|---|---|---|
| Results found | 200 | `{ "data": [ ... ] }` |
| Valid search, zero matches | **400** | `{ "status": 400, "message": "No result found." }` |
| Invalid input format | **400** | `{ "status": 400, "message": "Invalid requested Input Value." }` |

**Important:** A 400 "No result found" is a valid empty-result response, not an error. Always check the message body before treating a 400 as a failure.

### Handling in NestJS service

```typescript
if (!response.ok) {
  const errorBody = await response.json().catch(() => ({}));
  const msg: string = (errorBody as any)?.message ?? '';
  if (/no result found/i.test(msg)) {
    // Valid query, zero matches — return empty payload
    return { mode, requestedValue, requestUrl, data: [], noResult: true, message: 'No result found' };
  }
  throw new BadRequestException(msg.slice(0, 200) || 'CR API error');
}
```

---

## Input Validation / Sanitisation

| Field | Rule | Why |
|---|---|---|
| BRN | Digits only — strip everything else with `.replace(/\D/g, '')` | CR rejects spaces, hyphens, letters |
| Company name | Plain text only — no `.` `,` `/` `(` `)` `&` | These characters cause "Invalid requested Input Value" |

---

## Admin Panel Pattern (Manual Input + Platform Pre-population)

For any verification panel where platform data may be fictitious (dev/staging) or the admin needs to test with arbitrary values:

### State

```typescript
const [manualInputById, setManualInputById] = useState<
  Record<string, { companyName: string; brn: string }>
>({});
```

### Pre-populate on record load

```typescript
setManualInputById({
  [certification.id]: {
    companyName: professional.businessName ?? '',
    brn: certification.registrationNumber ?? '',
  },
});
```

### Always send textbox value — never silently fall back to DB

```typescript
const manualValue = mode === 'name'
  ? String(manualInputById[certId]?.companyName || '').trim()
  : String(manualInputById[certId]?.brn || '').trim();

if (!manualValue) {
  alert(mode === 'name' ? 'Enter a company name.' : 'Enter a BRN.');
  return;
}

const query = new URLSearchParams({ mode, value: manualValue });
```

### API controller

```typescript
@Get(':id/certifications/:certificationId/brc-check')
async runBrcCheck(
  @Param('id') id: string,
  @Param('certificationId') certificationId: string,
  @Query('mode') mode?: string,
  @Query('value') value?: string,   // always provided by UI; optional for direct API calls
) { ... }
```

### Service — optional DB fallback (used only by direct API calls, not the UI)

```typescript
async runBrcCheck(id, certificationId, mode, manualValue?: string) {
  const cert = await this.prisma.professionalCertification.findUnique({ ... });
  const rawValue = manualValue || cert.registrationNumber || cert.professional.businessName;
  ...
}
```

---

## Other HK Regulatory APIs (To Explore)

| Registry | Regulator | Notes |
|---|---|---|
| Registered Electrical Workers / Contractors | EMSD | https://www.emsd.gov.hk — no public open data API yet; manual document verification |
| Licensed Plumbers | WSD | https://www.wsd.gov.hk — no public API; PDF register only |
| Registered Gas Installers / Contractors | EMSD | Same as above |
| Construction Workers Registration | CIC | https://www.cic.hk — CIC Worker Registration portal; no open API |
| CIC Trade Test Certificates | CIC | Same as above |

For registries without a public API the recommended approach is **document upload + admin manual review** (same `ProfessionalCertification` table, same `verificationStatus` flow, just no automated lookup button).

---

## Related Files

| File | Purpose |
|---|---|
| `apps/api/src/professionals/professionals.service.ts` | `runBrcCheck()` — builds CR URL, handles 400 no-result |
| `apps/api/src/professionals/professionals.controller.ts` | `GET :id/certifications/:certificationId/brc-check` |
| `apps/web/src/app/admin/professionals/page.tsx` | Admin BRC panel UI — inputs, buttons, result display |
| `apps/api/prisma/migrations/20260520233000_add_professional_certifications/migration.sql` | Schema — `CertificationType`, `ProfessionalCertification`, seed data |
