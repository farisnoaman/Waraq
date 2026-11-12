import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import supabase from '../lib/supabase';
import { api, ApiError, setAccessToken } from '../lib/api';
import { clearOfflineData } from '../lib/offline';
import { signInWithGoogle } from '../lib/googleAuth';
import { SITE_NAME } from '../lib/site';
import type { Profile } from '../lib/types';
import { t } from '../lib/i18n';

const PROFILE_KEY = 'waraqpro.profile.v1';
const ACTIVITY_KEY = 'waraqpro.last_activity.v1';

/** Signed-in users are signed out after this much inactivity. */
export const IDLE_LIMIT_MS = 10 * 60 * 1000;
const IDLE_WARNING_MS = 9 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'];

interface SignUpResult {
  profile: Profile | null;
  needsConfirmation: boolean;
}

interface AuthValue {
  profile: Profile | null;
  loading: boolean;
  /** True when showing a remembered profile because the device is offline. */
  offlineSession: boolean;
  /** Seconds until automatic sign-out, once the warning period starts. */
  idleSecondsLeft: number | null;
  signIn: (email: string, password: string) => Promise<Profile>;
  signUp: (fullName: string, email: string, password: string) => Promise<SignUpResult>;
  googleSignIn: () => boolean;
  signOut: () => Promise<void>;
  stayActive: () => void;
  updateProfile: (input: { full_name: string; company: string; phone: string }) => Promise<Profile>;
}

const AuthContext = createContext<AuthValue | null>(null);

function readCachedProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: Profile | null) {
  try {
    if (profile) window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else window.localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* storage unavailable */
  }
}

function readActivity(): number {
  try {
    return Number(window.localStorage.getItem(ACTIVITY_KEY) || 0);
  } catch {
    return 0;
  }
}

function markActivity() {
  try {
    window.localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}

function clearActivity() {
  try {
    window.localStorage.removeItem(ACTIVITY_KEY);
  } catch {
    /* storage unavailable */
  }
}

function friendlyAuthError(message: string | undefined): string {
  const text = (message || '').toLowerCase();
  if (text.includes('invalid login')) return 'The email or password is not correct.';
  if (text.includes('email not confirmed')) {
    return 'Please confirm your email address first. Check your inbox for the confirmation link.';
  }
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (text.includes('rate limit') || text.includes('too many')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (text.includes('password')) return 'That password is not accepted. Use at least 8 characters.';
  if (text.includes('fetch') || text.includes('network')) {
    return 'We could not reach the sign-in service. Check your connection and try again.';
  }
  return 'We could not sign you in. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineSession, setOfflineSession] = useState(false);
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);

  const profileRef = useRef<Profile | null>(null);
  const inflight = useRef<{ uid: string; promise: Promise<Profile | null> } | null>(null);
  const signingOut = useRef(false);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const applySession = useCallback((session: Session | null) => {
    setAccessToken(session?.access_token ?? null);
    setUserId(session?.user?.id ?? null);
  }, []);

  /** Loads the profile (and role) from the server. The role is never taken from the browser. */
  const loadProfile = useCallback((uid: string): Promise<Profile | null> => {
    if (inflight.current?.uid === uid) return inflight.current.promise;
    const promise = (async () => {
      try {
        const fresh = await api<Profile>('/api/me');
        writeCachedProfile(fresh);
        setProfile(fresh);
        setOfflineSession(false);
        return fresh;
      } catch (err) {
        const cached = readCachedProfile();
        const unreachable = err instanceof ApiError && (err.isNetwork || err.status >= 500);
        if (unreachable && cached && cached.id === uid) {
          // Offline: show the remembered profile. Every API call is still
          // authorised on the server, so this only affects what is displayed.
          setProfile(cached);
          setOfflineSession(true);
          return cached;
        }
        if (err instanceof ApiError && err.status === 401) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
        }
        setProfile(null);
        return null;
      } finally {
        inflight.current = null;
      }
    })();
    inflight.current = { uid, promise };
    return promise;
  }, []);

  // Session bootstrap and auth events. The callback only updates state: calling
  // the Supabase client from inside its own auth callback can deadlock.
  useEffect(() => {
    let active = true;

    const bootstrap = () => {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!active) return;
          applySession(data.session);
          if (!data.session) {
            const cached = readCachedProfile();
            if (cached && !navigator.onLine) {
              // Offline with an expired token: keep read-only access to saved orders.
              setProfile(cached);
              setOfflineSession(true);
            } else if (navigator.onLine) {
              setProfile(null);
              setOfflineSession(false);
            }
            setLoading(false);
          }
          setSessionChecked(true);
        })
        .catch(() => {
          if (!active) return;
          setLoading(false);
          setSessionChecked(true);
        });
    };
    bootstrap();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      applySession(session);
      if (event === 'SIGNED_OUT') {
        writeCachedProfile(null);
        setProfile(null);
        setOfflineSession(false);
        setLoading(false);
      }
    });

    // Reconnecting re-validates the session with the server.
    window.addEventListener('online', bootstrap);
    return () => {
      active = false;
      data.subscription.unsubscribe();
      window.removeEventListener('online', bootstrap);
    };
  }, [applySession]);

  useEffect(() => {
    if (!sessionChecked || !userId) return;
    let active = true;
    if (profileRef.current?.id !== userId) setLoading(true);
    loadProfile(userId).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [sessionChecked, userId, loadProfile]);

  const finishSignOut = useCallback(
    async (reason?: 'idle') => {
      if (signingOut.current) return;
      signingOut.current = true;
      const uid = profileRef.current?.id ?? null;
      try {
        // Online: revoke the session everywhere. Offline: at least forget it here.
        const { error } = await supabase.auth.signOut(
          navigator.onLine ? undefined : { scope: 'local' },
        );
        if (error) await supabase.auth.signOut({ scope: 'local' });
      } catch {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
      }
      setAccessToken(null);
      writeCachedProfile(null);
      clearActivity();
      if (uid) await clearOfflineData(uid);
      setProfile(null);
      setUserId(null);
      setOfflineSession(false);
      setIdleSecondsLeft(null);
      signingOut.current = false;
      navigate(reason === 'idle' ? '/login?reason=idle' : '/login', { replace: true });
    },
    [navigate],
  );

  // Automatic sign-out after 10 minutes without activity (shared across tabs).
  // The countdown pauses while the device is offline, so a buyer can keep
  // reading saved orders, and is enforced as soon as it reconnects.
  const profileId = profile?.id ?? null;
  useEffect(() => {
    if (!profileId) return;
    if (!readActivity()) markActivity();

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < 2000) return;
      const last = readActivity();
      if (navigator.onLine && last > 0 && now - last >= IDLE_LIMIT_MS) {
        void finishSignOut('idle');
        return;
      }
      lastWrite = now;
      markActivity();
      setIdleSecondsLeft(null);
    };

    const tick = () => {
      if (!navigator.onLine) {
        setIdleSecondsLeft(null);
        return;
      }
      const idleFor = Date.now() - (readActivity() || Date.now());
      if (idleFor >= IDLE_LIMIT_MS) {
        void finishSignOut('idle');
        return;
      }
      setIdleSecondsLeft(
        idleFor >= IDLE_WARNING_MS ? Math.max(1, Math.ceil((IDLE_LIMIT_MS - idleFor) / 1000)) : null,
      );
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    return () => {
      window.clearInterval(interval);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity));
    };
  }, [profileId, finishSignOut]);

  const value = useMemo<AuthValue>(
    () => ({
      profile,
      loading,
      offlineSession,
      idleSecondsLeft,

      async signIn(email, password) {
        markActivity();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) throw new Error(t(friendlyAuthError(error?.message)));
        applySession(data.session);
        const loaded = await loadProfile(data.session.user.id);
        if (!loaded) {
          throw new Error(t('You are signed in, but we could not load your profile. Please try again.'));
        }
        return loaded;
      },

      async signUp(fullName, email, password) {
        markActivity();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // Only the display name is sent. Roles are assigned on the server.
          options: { data: { full_name: fullName } },
        });
        if (error) throw new Error(t(friendlyAuthError(error.message)));
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          throw new Error(t('An account with this email already exists. Sign in instead.'));
        }
        if (!data.session) return { profile: null, needsConfirmation: true };
        applySession(data.session);
        const loaded = await loadProfile(data.session.user.id);
        return { profile: loaded, needsConfirmation: false };
      },

      googleSignIn() {
        markActivity();
        return signInWithGoogle(SITE_NAME);
      },

      signOut: () => finishSignOut(),

      stayActive() {
        markActivity();
        setIdleSecondsLeft(null);
      },

      async updateProfile(input) {
        const updated = await api<Profile>('/api/me', { method: 'PUT', body: input });
        writeCachedProfile(updated);
        setProfile(updated);
        return updated;
      },
    }),
    [profile, loading, offlineSession, idleSecondsLeft, applySession, loadProfile, finishSignOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
