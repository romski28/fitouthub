# OTP Bypass — Escrow Deposit Flow

**Date:** June 26, 2026
**Status:** OTP verification is **bypassed** for escrow deposits.

---

## What was changed

The escrow deposit flow had a two-phase UX:
1. **Confirm** — review deposit amount, click "Deposit now"
2. **OTP** — receive a 6-digit code via email, enter it, then proceed to Stripe checkout

This was bypassed so **"Deposit now" goes straight to Stripe checkout** with no OTP step.

### Frontend (`apps/web/src/components/next-steps/deposit-escrow-modal.tsx`)

`handleDepositNow` originally called `requestOtp()` and switched to the OTP phase. Now it calls the checkout endpoint directly:

```ts
// Bypass OTP — go straight to checkout.
// To re-enable OTP, uncomment the three lines below and comment out the checkout call.
// await requestOtp(pendingTx.id);
// setOtpCode('');
// setPhase('otp');
setOtpSending(true);
try {
  const checkoutRes = await fetch(`${API_BASE_URL}/financial/${pendingTx.id}/checkout-session`, { ... });
  // ... redirect to Stripe
}
```

The OTP UI (input field, resend button, `handleVerifyAndCheckout`) is **fully intact** — just unreachable.

### Backend (`apps/api/src/financial/financial.service.ts`)

`createEscrowCheckoutSession` originally called `await this.assertEscrowOtpVerified(...)`, which threw `"OTP verification is required before checkout"` if no verified challenge existed. Now wrapped in try/catch:

```ts
let verifiedChallenge: any = null;
try {
  verifiedChallenge = await this.assertEscrowOtpVerified(transactionId, actorId);
} catch {
  verifiedChallenge = { id: 'otp-bypassed', verifiedAt: new Date() };
}
```

The challenge `consumedAt` update is guarded: `if (verifiedChallenge.id !== 'otp-bypassed')`.

Bypassed checkouts are logged in the transaction notes as `otp_bypassed:true` instead of `otp_verified_challenge:<id>`.

---

## How to reactivate OTP

### Step 1 — Backend

In `apps/api/src/financial/financial.service.ts`, find `createEscrowCheckoutSession` and restore:

```ts
// BEFORE (bypassed):
let verifiedChallenge: any = null;
try {
  verifiedChallenge = await this.assertEscrowOtpVerified(transactionId, actorId);
} catch {
  verifiedChallenge = { id: 'otp-bypassed', verifiedAt: new Date() };
}

// AFTER (reactivated):
const verifiedChallenge = await this.assertEscrowOtpVerified(transactionId, actorId);
```

Also remove the `if (verifiedChallenge.id !== 'otp-bypassed')` guard — change to unconditional:

```ts
await (this.prisma as any).escrowCheckoutOtpChallenge.update({
  where: { id: verifiedChallenge.id },
  data: { consumedAt: new Date() },
});
```

And simplify the notes append back to the original single line.

**Deploy:** Push to main → Render redeploys the API.

### Step 2 — Frontend

In `apps/web/src/components/next-steps/deposit-escrow-modal.tsx`, find `handleDepositNow` and restore:

```ts
// BEFORE (bypassed — calls checkout directly):
setOtpSending(true);
try {
  const checkoutRes = await fetch(...);
  // ...
}

// AFTER (reactivated):
await requestOtp(pendingTx.id);
setOtpCode('');
setPhase('otp');
```

Also change the button text back from `'Processing...'` to `'Sending OTP...'`.

**Deploy:** Push to main → Vercel redeploys the frontend.

---

## Files involved

| File | Changes |
|------|---------|
| `apps/web/src/components/next-steps/deposit-escrow-modal.tsx` | `handleDepositNow` skips OTP, button says "Processing..." |
| `apps/api/src/financial/financial.service.ts` | `assertEscrowOtpVerified` wrapped in try/catch, challenge update guarded |
