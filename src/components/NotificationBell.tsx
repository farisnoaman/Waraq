import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check, ClipboardList, Truck, X } from 'lucide-react';
import { useNotifications, notificationText } from '../lib/notifications';
import { formatDateTime } from '../lib/format';
import type { NotificationItem, NotificationType } from '../lib/types';
import { t } from '../lib/i18n';

const TYPE_ICON: Record<NotificationType, typeof Bell> = {
  info: Bell,
  order_new: ClipboardList,
  order_confirmed: Check,
  order_on_the_way: Truck,
  delivery_assigned: Truck,
};

const TYPE_LABEL: Record<NotificationType, string> = {
  info: 'Notification',
  order_new: 'New order',
  order_confirmed: 'Your order is confirmed',
  order_on_the_way: 'Your order is on the way',
  delivery_assigned: 'New delivery assigned',
};

function Toast({ item, onClose }: { item: NotificationItem; onClose: () => void }) {
  const text = notificationText(item);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.22 }}
      role="status"
      className="on-dark pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl bg-forest p-4 text-paper shadow-[0_18px_40px_-16px_rgba(0,0,0,0.5)]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-bright/20 text-primary-bright">
        <Bell className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('New notification')}</p>
        <p className="mt-0.5 text-sm text-paper/85">{text.title}</p>
        {text.body && <p className="mt-0.5 text-sm text-paper/70">{text.body}</p>}
        {item.order_id && (
          <Link
            to="/buyer"
            onClick={onClose}
            className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary-bright underline-offset-4 hover:underline"
          >
            {t('View order')}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('Dismiss')}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-paper/70 transition-colors hover:bg-white/10 hover:text-paper"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </motion.div>
  );
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const { notifications, unread, loading, error, reload, markAllRead } = useNotifications((item) =>
    setToast(item),
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const panelBoxRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );

  /**
   * The header carries a backdrop blur, which makes it the containing block
   * for fixed-position descendants. The panel is therefore rendered in a
   * portal on the body, and on wide screens it is placed under the bell.
   */
  const placePanel = useCallback(() => {
    const bell = bellRef.current;
    if (!bell || window.innerWidth < 1024) {
      setPanelPos(null);
      return;
    }
    const width = Math.min(384, window.innerWidth - 32);
    const rect = bell.getBoundingClientRect();
    const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
    const aligned = rtl ? rect.left : rect.right - width;
    const left = Math.max(12, Math.min(aligned, window.innerWidth - width - 12));
    setPanelPos({ left, top: rect.bottom + 8, width });
  }, []);

  useEffect(() => {
    placePanel();
    window.addEventListener('resize', placePanel);
    return () => window.removeEventListener('resize', placePanel);
  }, [placePanel]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideButton = panelRef.current?.contains(target);
      const insidePanel = panelBoxRef.current?.contains(target);
      if (!insideButton && !insidePanel) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <div ref={panelRef} className="relative">
        <button
          ref={bellRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls="notifications-panel"
          aria-label={t('Notifications')}
          title={t('Notifications')}
          className="relative grid h-11 w-11 place-items-center rounded-full border border-line text-ink transition-colors hover:bg-paper-deep"
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -end-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>

        {createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelBoxRef}
                id="notifications-panel"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                style={panelPos ?? undefined}
                className={
                  panelPos
                    ? 'fixed z-50 overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_40px_-24px_rgba(4,38,29,0.4)]'
                    : 'fixed inset-x-3 bottom-3 z-50 max-h-[80vh] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_40px_-24px_rgba(4,38,29,0.4)]'
                }
              >
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <p className="font-display text-lg">{t('Notifications')}</p>
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      className="inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-sm font-semibold text-primary-strong transition-colors hover:bg-paper-deep"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('Mark all as read')}
                    </button>
                  )}
                </div>

                <div className="max-h-[22rem] overflow-y-auto">
                  {loading && notifications.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-muted">{t('Loading')}…</p>
                  )}
                  {error && (
                    <p className="px-4 py-8 text-center text-sm text-danger">
                      {t('Something went wrong. Please try again.')}
                    </p>
                  )}
                  {!loading && !error && notifications.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-muted">{t('No notifications yet')}</p>
                  )}
                  <ul>
                    {notifications.map((item) => {
                      const Icon = TYPE_ICON[item.type] ?? Bell;
                      const text = notificationText(item);
                      return (
                        <li
                          key={item.id}
                          className={`flex gap-3 border-b border-line/60 px-4 py-3 last:border-b-0 ${
                            item.read_at ? '' : 'bg-mint/30'
                          }`}
                        >
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper-deep text-primary-strong">
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink">{text.title}</p>
                            {text.body && <p className="mt-0.5 text-sm text-muted">{text.body}</p>}
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                              <span>{t(TYPE_LABEL[item.type] ?? 'Notification')}</span>
                              <span aria-hidden="true">·</span>
                              <span>{formatDateTime(item.created_at)}</span>
                            </div>
                            {item.order_id && (
                              <Link
                                to="/buyer"
                                onClick={() => setOpen(false)}
                                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-strong underline-offset-4 hover:underline"
                              >
                                {t('View order')}
                              </Link>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void reload()}
                    className="w-full border-t border-line px-4 py-2.5 text-center text-sm font-semibold text-primary-strong transition-colors hover:bg-paper-deep"
                  >
                    {t('Refresh')}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
      </div>

      {createPortal(
        <AnimatePresence>
          {toast && (
            <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[55] flex justify-center px-4 sm:bottom-5">
              <Toast item={toast} onClose={() => setToast(null)} />
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
