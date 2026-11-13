import supabase from './db-client.js';
import { createHandler, q, readBody } from './_lib/http.js';
import { getAuth } from './_lib/auth.js';

/**
 * The signed-in user's own notifications. The API reads with the service key,
 * so every query is scoped by the profile id from the verified session.
 */
export default createHandler({
  async GET(req) {
    const { profile } = await getAuth(req);
    const [rows, unread] = await Promise.all([
      q(
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ),
      q(
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .is('read_at', null),
      ),
    ]);
    return { notifications: rows, unread: unread.count ?? 0 };
  },

  async PATCH(req) {
    const { profile } = await getAuth(req);
    const body = readBody(req);
    const id = Number(body?.id);

    if (id) {
      const rows = await q(
        supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', id)
          .eq('user_id', profile.id)
          .is('read_at', null)
          .select(),
      );
      return { ok: true, changed: rows.length };
    }

    await q(
      supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .is('read_at', null),
    );
    return { ok: true, changed: 0 };
  },
});
