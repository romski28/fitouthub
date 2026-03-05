-- Add OTP verification fields to Professional table
ALTER TABLE "Professional" ADD COLUMN "otpCode" TEXT;
ALTER TABLE "Professional" ADD COLUMN "otpExpiresAt" TIMESTAMP(3);
ALTER TABLE "Professional" ADD COLUMN "otpVerifiedAt" TIMESTAMP(3);
