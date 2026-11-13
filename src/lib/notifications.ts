import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { t } from './i18n';
import type { NotificationItem, NotificationType, NotificationsResponse } from './types';

const POLL_MS = 30000;

type Params = Record<string, string | number>;

/** The text of a notification, in the language the reader chose. */
export function notificationText(item: Pick<NotificationItem, 'type' | 'params'>): {
  title: string;
  body: string;
} {
  const p = (item.params ?? {}) as Params;
  switch (item.type as NotificationType) {
    case 'order_new':
      return {
        title: t('New order'),
        body: t('{0} placed order {1} for {2} SAR.', [p.buyer_name ?? '', p.reference ?? '', p.total ?? '']),
      };
    case 'order_confirmed':
      return {
        title: t('Your order is confirmed'),
        body: t('Order {0} has been confirmed by Waraq Pro and is being prepared.', [p.reference ?? '']),
      };
    case 'order_on_the_way':
      return {
        title: t('Your order is on the way'),
        body: t('Order {0} has been dispatched and is on its way to you.', [p.reference ?? '']),
      };
    case 'delivery_assigned':
      return {
        title: t('New delivery assigned'),
        body: t('You were assigned the delivery for order {0}.', [p.reference ?? '']),
      };
    default:
      return { title: t('Notification'), body: '' };
  }
}

/**
 * Watches the signed-in user's notifications and calls `onNew` the first time
 * one arrives while the app is open, so the caller can raise a toast.
 */
export function useNotifications(onNew?: (item: NotificationItem) => void) {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<Set<number>>(new Set());
  const first = useRef(true);
  const onNewRef = useRef(onNew);

  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);

  const reload = useCallback(async () => {
    try {
      const next = await api<NotificationsResponse>('/api/notifications');
      setData(next);
      setError(null);
      if (first.current) {
        seen.current = new Set(next.notifications.map((n) => n.id));
        first.current = false;
        return;
      }
      const fresh = next.notifications.filter((n) => !seen.current.has(n.id));
      for (const item of fresh) {
        seen.current.add(item.id);
        onNewRef.current?.(item);
      }
    } catch {
      // The table may not exist yet on a fresh database. The bell stays quiet
      // instead of taking the portal down with it.
      setError(null);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    const timer = window.setInterval(() => void reload(), POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [reload]);

  const markAllRead = useCallback(async () => {
    await api('/api/notifications', { method: 'PATCH', body: {} });
    setData((current) =>
      current
        ? {
            ...current,
            unread: 0,
            notifications: current.notifications.map((n) => ({ ...n, read_at: n.read_at ?? '' })),
          }
        : current,
    );
  }, []);

  return {
    notifications: data?.notifications ?? [],
    unread: data?.unread ?? 0,
    loading: data === null,
    error,
    reload,
    markAllRead,
  };
}
