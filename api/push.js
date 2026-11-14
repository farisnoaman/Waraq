import supabase from './db-client.js';
import { createHandler, getAuth, q, readBody } from './_lib/http.js';
import { schemas } from './_lib/schemas.js';

/*
 * Web push subscription management (signed-in users). The browser's
 * PushSubscription JSON is stored per user so the API can push alerts when
 * notifications are created. Only 'subscribe' / 'unsubscribe' actions.
 */

export default createHandler({
  async POST(req) {
    const auth = await getAuth(req);
    const body = readBody(req);
    const action = String(body.action || 'subscribe');

    if (action === 'unsubscribe') {
      const endpoint = String(body.endpoint || '');
      if (!endpoint) return { ok: true };
      await q(
        supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', auth.profile.id),
      );
      return { ok: true };
    }

    const subscription = body.subscription;
    const keys = subscription?.keys;
    const endpoint = String(subscription?.endpoint || '');
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return { ok: true };
    }
    const lang = body.lang === 'en' ? 'en' : 'ar';
    await q(
      supabase.from('push_subscriptions').upsert(
        {
          user_id: auth.profile.id,
          endpoint,
          p256dh: String(keys.p256dh).slice(0, 200),
          auth: String(keys.auth).slice(0, 200),
          lang,
          user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
        },
        { onConflict: 'endpoint' },
      ),
    );
    return { ok: true };
  },
});
