import supabase from '../db-client.js';
import { HttpError, q } from './http.js';
import { clean } from './schemas.js';

/*
 * Roles are stored in Supabase Auth `app_metadata.role`. Unlike `user_metadata`
 * or any table row, app_metadata can only be written with the service-role key
 * (i.e. by this API), so a user can never grant themselves a role. The
 * `profiles.role` column is a display mirror that is re-synced on every request
 * and is never trusted for authorisation.
 *
 * The first administrator is identified by Supabase Auth user id. Add more ids
 * with the WARAQ_ADMIN_USER_IDS environment variable (comma separated).
 */
const BOOTSTRAP_ADMIN_IDS = new Set([
  '728d6e92-b38e-4ae7-9504-05f2343bdd47',
  ...String(process.env.WARAQ_ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
]);

export function resolveRole(user) {
  if (!user) return 'buyer';
  if (BOOTSTRAP_ADMIN_IDS.has(user.id)) return 'admin';
  const role = user.app_metadata?.role;
  return role === 'admin' || role === 'staff' ? role : 'buyer';
}

export function displayName(user) {
  const meta = user.user_metadata || {};
  const raw = meta.full_name || meta.name || (user.email || '').split('@')[0] || 'Buyer';
  return clean(raw).slice(0, 120) || 'Buyer';
}

/**
 * Returns the caller's profile, creating it on first sign-in (email or Google).
 * A brand-new account is always a buyer: nothing the user controls (sign-up
 * metadata, request bodies) is read when deciding the role.
 */
export async function ensureProfile(user, role) {
  const email = String(user.email || '').toLowerCase();
  const existing = await q(supabase.from('profiles').select('*').eq('id', user.id).maybeSingle());

  if (existing) {
    if (existing.role !== role || existing.email !== email) {
      await q(supabase.from('profiles').update({ role, email }).eq('id', user.id));
    }
    return { ...existing, role, email };
  }

  const created = await supabase
    .from('profiles')
    .insert({ id: user.id, email, full_name: displayName(user), role })
    .select()
    .single();
  if (!created.error) return created.data;

  // Two first requests can race; the loser re-reads the winner's row.
  const retry = await q(supabase.from('profiles').select('*').eq('id', user.id).maybeSingle());
  if (retry) return { ...retry, role };
  throw created.error;
}

/** Verifies the bearer token with Supabase Auth, then resolves role and profile. */
export async function getAuth(req) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'Please sign in to continue.');

  // getUser() asks the Auth server, so a revoked session or a changed role
  // takes effect immediately rather than when the token next refreshes.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new HttpError(401, 'Your session has expired. Please sign in again.');
  }
  const role = resolveRole(data.user);
  if (role === 'admin' && data.user.app_metadata?.role !== 'admin') {
    // One-time sync so the bootstrap administrator's signed token carries the role too.
    await supabase.auth.admin
      .updateUserById(data.user.id, {
        app_metadata: { ...(data.user.app_metadata || {}), role: 'admin' },
      })
      .catch(() => undefined);
  }
  const profile = await ensureProfile(data.user, role);
  return { user: data.user, profile, role };
}

export function requireRole(auth, ...roles) {
  if (!roles.includes(auth.role)) {
    throw new HttpError(403, 'You do not have permission to do that.');
  }
}

/** Reads another user's authoritative record (and role) from Supabase Auth. */
export async function getAuthUser(id) {
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error || !data?.user) return null;
  return data.user;
}
