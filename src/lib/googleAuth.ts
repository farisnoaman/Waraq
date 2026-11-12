import supabase from './supabase';

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const STATE_KEY = 'waraqpro.google.state';

function buildGoogleUrl(appName: string): string | null {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const redirectUri = import.meta.env.VITE_GOOGLE_AUTH_PROXY as string | undefined;
  if (!clientId || !redirectUri) return null;
  const state = btoa(
    JSON.stringify({
      origin: window.location.origin,
      appName,
      nonce: crypto.randomUUID(),
    }),
  );
  try {
    window.sessionStorage.setItem(STATE_KEY, state);
  } catch {
    /* storage unavailable: the sign-in still works, only the state check is skipped */
  }
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&prompt=select_account&state=${encodeURIComponent(state)}`;
}

/** Returns false when Google sign-in is not configured or the popup was blocked. */
export function signInWithGoogle(appName = 'this app'): boolean {
  const url = buildGoogleUrl(appName);
  if (!url) {
    // Self-hosted (for example on Coolify): use the Google provider configured in
    // the Supabase project. The browser leaves and returns signed in.
    void supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/buyer` },
    });
    return true;
  }

  // Always window.open(), never window.location: the app may be running inside
  // a preview iframe, and navigating that to Google would break it.
  const popup = window.open(url, 'google-auth', isMobile() ? '' : 'width=500,height=600');
  if (!popup) return false;

  // The callback popup posts the session back, then closes. Only messages from
  // that popup are trusted.
  const handler = async (event: MessageEvent) => {
    if (event.source !== popup) return;
    if (event.data?.type === 'google-auth-denied') {
      window.removeEventListener('message', handler);
      try {
        window.sessionStorage.removeItem(STATE_KEY);
      } catch {
        /* storage unavailable */
      }
      return;
    }
    if (event.data?.type !== 'google-auth-success') return;
    window.removeEventListener('message', handler);

    // The state travels through Google and back. It has to match the one this
    // tab created, otherwise the session belongs to another sign-in attempt.
    let expected: string | null = null;
    try {
      expected = window.sessionStorage.getItem(STATE_KEY);
      window.sessionStorage.removeItem(STATE_KEY);
    } catch {
      /* storage unavailable */
    }
    if (expected && event.data.state !== expected) {
      console.error('[google-auth] the sign-in state did not match.');
      return;
    }

    const { access_token, refresh_token } = event.data;
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) console.error('[google-auth] setSession failed:', error.message);
  };
  window.addEventListener('message', handler);
  return true;
}

/**
 * Redirect fallback: when the popup cannot reach this tab, the callback sends
 * the popup here with the session in the URL fragment. supabase-js stores it on
 * load, which signs in every tab of the app; this only closes the popup.
 */
export async function handleGoogleRedirect(): Promise<void> {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (!fragment.has('google_auth_popup')) return;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    console.error('[google-auth] redirect sign-in failed:', error?.message);
    return;
  }
  window.close();
}
