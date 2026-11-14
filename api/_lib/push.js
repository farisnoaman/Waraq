import * as webpushPkg from 'web-push';
const webpush = webpushPkg.default ?? webpushPkg;
import supabase from '../db-client.js';
import { q } from './http.js';

/*
 * Web Push sender (VAPID). When notify() records a notification, the same
 * payload is pushed to every phone/browser where that user enabled
 * notifications — so alerts arrive like WhatsApp even with the app closed.
 *
 * Requires the VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY environment variables
 * (generate once with: npx web-push generate-vapid-keys).
 */

let configured = false;

export function pushConfigured() {
  if (configured) return true;
  const publicKey =
    process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails('mailto:info@warq.pro', publicKey, privateKey);
  configured = true;
  return true;
}

/* Push copy per notification type, per subscription language. */
const AR = {
  order_new: (p) => `طلب جديد ${p.reference ?? ''} — ${p.buyer_name ?? ''}`,
  order_confirmed: (p) => `تم تأكيد طلبك ${p.reference ?? ''}`,
  order_on_the_way: (p) => `طلبك ${p.reference ?? ''} في الطريق إليك`,
  delivery_assigned: (p) => `توصيل جديد: ${p.reference ?? ''}`,
  message_new: (p) => `رسالة جديدة من ${p.name ?? ''}`,
  info: () => 'Waraq Pro',
};

const EN = {
  order_new: (p) => `New order ${p.reference ?? ''} — ${p.buyer_name ?? ''}`,
  order_confirmed: (p) => `Your order ${p.reference ?? ''} is confirmed`,
  order_on_the_way: (p) => `Order ${p.reference ?? ''} is on the way`,
  delivery_assigned: (p) => `New delivery: ${p.reference ?? ''}`,
  message_new: (p) => `New message from ${p.name ?? ''}`,
  info: () => 'Waraq Pro',
};

const URL_BY_TYPE = {
  order_new: '/admin/orders',
  order_confirmed: '/buyer',
  order_on_the_way: '/buyer',
  delivery_assigned: '/admin/deliveries',
  message_new: '/admin/inbox',
  info: '/',
};

export function buildPushPayload(type, params = {}, lang = 'ar') {
  const pack = lang === 'en' ? EN : AR;
  const make = pack[type] ?? pack.info;
  return {
    title: 'Waraq Pro',
    body: make(params),
    tag: type,
    url: URL_BY_TYPE[type] ?? '/',
  };
}

/** Sends a push to every subscription of the user; prunes dead endpoints. */
export async function sendPushToUser(userId, type, params = {}) {
  if (!userId || !pushConfigured()) return;
  const subs = await q(
    supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId),
  );
  if (!subs.length) return;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const payload = buildPushPayload(type, params, sub.lang);
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        // 404/410 = the subscription is gone: prune it so future sends are clean.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        } else {
          console.warn('[push] send failed:', err?.message ?? err);
        }
      }
    }),
  );
}
