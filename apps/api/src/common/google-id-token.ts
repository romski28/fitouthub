import { UnauthorizedException } from '@nestjs/common';

export type GoogleTokenProfile = {
  email: string;
  emailVerified: boolean;
  givenName?: string;
  familyName?: string;
  picture?: string;
  sub: string;
};

type GoogleTokenInfoResponse = {
  aud?: string;
  iss?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  given_name?: string;
  family_name?: string;
  picture?: string;
};

export async function verifyGoogleIdToken(
  idToken: string,
  expectedAudience: string,
): Promise<GoogleTokenProfile> {
  if (!idToken) {
    throw new UnauthorizedException('Google ID token is required');
  }

  if (!expectedAudience) {
    throw new UnauthorizedException('Google OAuth client ID is not configured');
  }

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
  );

  if (!response.ok) {
    throw new UnauthorizedException('Unable to verify Google ID token');
  }

  const data = (await response.json()) as GoogleTokenInfoResponse;

  if (data.aud !== expectedAudience) {
    throw new UnauthorizedException('Google token audience mismatch');
  }

  if (data.iss !== 'accounts.google.com' && data.iss !== 'https://accounts.google.com') {
    throw new UnauthorizedException('Google token issuer mismatch');
  }

  if (!data.sub || !data.email) {
    throw new UnauthorizedException('Google token is missing required profile fields');
  }

  const emailVerified =
    typeof data.email_verified === 'boolean'
      ? data.email_verified
      : String(data.email_verified).toLowerCase() === 'true';

  return {
    sub: data.sub,
    email: data.email,
    emailVerified,
    givenName: data.given_name,
    familyName: data.family_name,
    picture: data.picture,
  };
}
