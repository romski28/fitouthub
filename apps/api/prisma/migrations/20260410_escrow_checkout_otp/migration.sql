-- Create OTP challenges for escrow checkout step-up authentication
CREATE TABLE "EscrowCheckoutOtpChallenge" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "preferredChannel" "NotificationChannel",
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EscrowCheckoutOtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EscrowCheckoutOtpChallenge_transactionId_actorUserId_idx"
  ON "EscrowCheckoutOtpChallenge"("transactionId", "actorUserId");

CREATE INDEX "EscrowCheckoutOtpChallenge_expiresAt_idx"
  ON "EscrowCheckoutOtpChallenge"("expiresAt");

ALTER TABLE "EscrowCheckoutOtpChallenge"
  ADD CONSTRAINT "EscrowCheckoutOtpChallenge_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EscrowCheckoutOtpChallenge"
  ADD CONSTRAINT "EscrowCheckoutOtpChallenge_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
