-- Add OTP verification fields to User table
ALTER TABLE "User" ADD COLUMN "otpCode" TEXT;
ALTER TABLE "User" ADD COLUMN "otpExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "otpVerifiedAt" TIMESTAMP(3);
