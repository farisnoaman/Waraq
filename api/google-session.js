import { createHandler, HttpError, rateLimit, readBody } from './_lib/http.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Signs a visitor in with Google.
 *
 * The browser sends the authorization code that Google put in the redirect,
 * this handler swaps it for Google tokens with the client secret, and then
 * trades those for a Supabase session. The browser only ever receives the
 * Supabase session, so the Google client secret stays on the server.
 */
export default createHandler({
  async POST(req) {
    // Each call makes two outbound requests (Google + Supabase); cap the
    // hammering before those downstream services see it.
    rateLimit(req, 'google-session', 10, 10 * 60 * 1000);
    const { code, redirect_uri } = readBody(req);
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!clientId || !clientSecret) {
      throw new HttpError(500, 'Google sign-in is not configured on this server.');
    }
    if (!supabaseUrl || !supabaseKey) {
      throw new HttpError(500, 'The server is not configured yet.');
    }
    if (!code) {
      throw new HttpError(400, 'Missing authorization code.');
    }

    const googleRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: String(redirect_uri || ''),
      }),
    });
    const google = await googleRes.json();
    if (!googleRes.ok || !google.id_token) {
      throw new HttpError(400, google.error_description || 'Google sign-in could not be completed.');
    }

    const supabaseRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=id_token`, {
      method: 'POST',
      headers: { apikey: supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        id_token: google.id_token,
        access_token: google.access_token,
        refresh_token: google.refresh_token,
      }),
    });
    const session = await supabaseRes.json();
    if (!supabaseRes.ok || !session.access_token) {
      throw new HttpError(400, session.error_description || 'Google sign-in could not be completed.');
    }

    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in ?? 3600,
    };
  },
});
