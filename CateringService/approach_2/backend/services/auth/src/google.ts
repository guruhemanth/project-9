import { OAuth2Client } from 'google-auth-library';

export interface GooglePayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Verifies a Google ID token from the client.
 * In development, test environments, or when GOOGLE_CLIENT_ID starts with 'fake_',
 * accepts mock token stringified JSON { sub, email, name } for offline test execution.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  googleClientId?: string,
  isTesting = false
): Promise<GooglePayload> {
  // Support offline mock token for development & automated tests
  if (isTesting || !googleClientId || googleClientId.startsWith('fake_')) {
    try {
      const parsed = JSON.parse(idToken);
      if (parsed.sub && parsed.email) {
        return {
          sub: parsed.sub,
          email: parsed.email.toLowerCase().trim(),
          name: parsed.name || 'Google User',
          picture: parsed.picture,
        };
      }
    } catch {
      // Fall through to real verification
    }
  }

  if (!googleClientId) {
    throw new Error('Google OAuth Client ID is not configured on the server.');
  }

  const client = new OAuth2Client(googleClientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: googleClientId,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Invalid Google ID token payload');
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.given_name || 'Google User',
    picture: payload.picture,
  };
}
