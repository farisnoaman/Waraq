import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  Database,
  Hourglass,
  Lock,
  PackageCheck,
  Printer,
  Receipt,
  RefreshCw,
  ShieldAlert,
  Truck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import DocumentModal from '../../components/DocumentModal';
import { OrderItemsTable, OrderSummary } from '../../components/OrderBreakdown';
import ProfilePanel from '../../components/ProfilePanel';
import ResponsiveTable from '../../components/ResponsiveTable';
import WhatsAppIcon from '../../components/WhatsAppIcon';
import { Alert, Badge, ErrorPanel, PageHeader, Spinner, usePageTitle } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { api, ApiError, errorMessage } from '../../lib/api';
import {
  DELIVERY_STATUS_LABEL,
  formatDate,
  formatDateTime,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_SHORT,
  ORDER_STATUS_TONE,
  ORDER_STATUSES,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  round2,
  sar,
} from '../../lib/format';
import {
  listQueuedActions,
  loadOrdersSnapshot,
  queueAction,
  removeQueuedAction,
  saveOrdersSnapshot,
  type QueuedAction,
} from '../../lib/offline';
import { useOnline } from '../../lib/pwa';
import { PHONE_DISPLAY, whatsappLink } from '../../lib/site';
import type { Installment, Order, OrdersResponse, OrderStatus, Payment } from '../../lib/types';
import { t } from '../../lib/i18n';

const POLL_MS = 25000;

/**
 * Offline-first order data for the signed-in buyer:
 *  1. show the copy saved in IndexedDB immediately (works with no network),
 *  2. when online, replay anything queued offline, then fetch fresh orders,
 *  3. re-sync on reconnect, when the tab becomes visible, and every 25 seconds.
 */
function useBuyerOrders(userId: string) {
  const online = useOnline();
  const [orders, setOrders] = useState<Order[]>([]);
  const [sellerVat, setSellerVat] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const sync = useCallback(async () => {
    if (busy.current) return;
    if (!navigator.onLine) {
      setLoading(false);
      return;
    }
    busy.current = true;
    setSyncing(true);
    try {
      const pending = await listQueuedActions(userId);
      for (const action of pending) {
        try {
          await api('/api/orders', {
            method: 'PUT',
            body: { id: action.orderId, action: 'confirm_reception' },
          });
          if (action.id != null) await removeQueuedAction(action.id);
        } catch (err) {
          // Refused by the server (for example already confirmed): drop it.
          // Network trouble: keep it queued and stop for now.
          if (err instanceof ApiError && !err.isNetwork && err.status < 500) {
            if (action.id != null) await removeQueuedAction(action.id);
          } else {
            throw err;
          }
        }
      }
      setQueued(await listQueuedActions(userId));

      const response = await api<OrdersResponse>('/api/orders?scope=mine');
      const stamp = new Date().toISOString();
      setOrders(response.orders);
      setSellerVat(response.seller_vat_number);
      setSyncedAt(stamp);
      setError(null);
      await saveOrdersSnapshot({
        userId,
        orders: response.orders,
        sellerVatNumber: response.seller_vat_number,
        syncedAt: stamp,
      });
    } catch (err) {
      if (!(err instanceof ApiError && err.isNetwork)) setError(errorMessage(err));
    } finally {
      busy.current = false;
      setSyncing(false);
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const [snapshot, pending] = await Promise.all([
        loadOrdersSnapshot(userId),
        listQueuedActions(userId),
      ]);
      if (!active) return;
      if (snapshot) {
        setOrders(snapshot.orders);
        setSellerVat(snapshot.sellerVatNumber);
        setSyncedAt(snapshot.syncedAt);
        setLoading(false);
      }
      setQueued(pending);
      await sync();
    })();
    return () => {
      active = false;
    };
  }, [userId, sync]);

  useEffect(() => {
    const onOnline = () => void sync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === 'visible') void sync();
    }, POLL_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
  }, [sync]);

  const confirmReception = useCallback(
    async (orderId: number): Promise<'done' | 'queued'> => {
      const enqueue = async () => {
        await queueAction({
          userId,
          type: 'confirm_reception',
          orderId,
          queuedAt: new Date().toISOString(),
        });
        setQueued(await listQueuedActions(userId));
      };
      if (!navigator.onLine) {
        await enqueue();
        return 'queued';
      }
      try {
        await api('/api/orders', { method: 'PUT', body: { id: orderId, action: 'confirm_reception' } });
        await sync();
        return 'done';
      } catch (err) {
        if (err instanceof ApiError && err.isNetwork) {
          await enqueue();
          return 'queued';
        }
        throw err;
      }
    },
    [userId, sync],
  );

  return { orders, sellerVat, loading, syncing, syncedAt, queued, error, online, sync, confirmReception };
}

function OrderProgress({ status }: { status: OrderStatus }) {
  const index = ORDER_STATUSES.indexOf(status);
  return (
    <div>
      <ol
        className="grid grid-cols-7 gap-1.5"
        aria-label={t("Order progress: step {0} of {1}, {2}", [index + 1, ORDER_STATUSES.length, t(ORDER_STATUS_LABEL[status])])}
      >
        {ORDER_STATUSES.map((step, i) => (
          <li key={step} aria-hidden="true">
            <span className={`block h-1.5 rounded-full ${i <= index ? 'bg-primary' : 'bg-line'}`} />
            <span
              className={`mt-1.5 hidden text-[11px] leading-tight md:block ${
                i === index ? 'font-semibold text-primary-strong' : i < index ? 'text-ink/80' : 'text-muted'
              }`}
            >
              {t(ORDER_STATUS_SHORT[step])}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-muted md:hidden">
        {t("Step")}{' '}{index + 1}{' '}{t("of")}{' '}{ORDER_STATUSES.length} ·{' '}
        <span className="font-semibold text-ink">{t(ORDER_STATUS_LABEL[status])}</span>
      </p>
    </div>
  );
}

interface CardProps {
  order: Order;
  queuedConfirmation: boolean;
  online: boolean;
  onConfirm: (orderId: number) => Promise<'done' | 'queued'>;
  onBill: (order: Order) => void;
  onReceipt: (order: Order, installment: Installment) => void;
}

function OrderCard({ order, queuedConfirmation, online, onConfirm, onBill, onReceipt }: CardProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const delivery = order.delivery;
  const payment = order.payment;
  const canConfirm =
    !order.buyer_confirmed_at &&
    !queuedConfirmation &&
    delivery != null &&
    (delivery.status === 'dispatched' || delivery.status === 'delivered');

  const confirm = async () => {
    setConfirming(true);
    setFailure(null);
    try {
      await onConfirm(order.id);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <li className="rounded-2xl border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-display text-xl tracking-wide sm:text-2xl">{order.reference}</h3>
            <Badge tone={ORDER_STATUS_TONE[order.status]}>{t(ORDER_STATUS_LABEL[order.status])}</Badge>
            {order.buyer_confirmed_at && (
              <Badge tone="mint">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Reception confirmed")}
              </Badge>
            )}
            {queuedConfirmation && (
              <Badge tone="brass">
                <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
                {t("Confirmation queued for sync")}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            {t("Placed")}{' '}{formatDate(order.created_at)} · {order.items.length}{' '}
            {order.items.length === 1 ? t("item") : t("items")} · {order.city}
          </p>
        </div>
        <div className="w-full rounded-xl border border-line bg-card px-4 py-3 text-start sm:w-auto sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:text-end">
          <p className="text-[10px] uppercase tracking-wider text-muted sm:text-xs">
            {t("Final payable (incl. VAT)")}
          </p>
          <p className="font-display text-xl font-semibold text-primary-strong sm:text-2xl">
            {sar(order.total)}
          </p>
          <p className="text-xs text-muted sm:text-sm">
            {order.items.length} {order.items.length === 1 ? t("item") : t("items")} ·{' '}
            {order.total_units}{' '}{t("units")}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <OrderProgress status={order.status} />
      </div>

      {delivery && delivery.status !== 'draft' && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-paper-deep/70 px-4 py-3 text-sm">
          <Truck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="font-semibold">{t(DELIVERY_STATUS_LABEL[delivery.status])}</span>
          {delivery.staff_name && (
            <span className="text-muted">
              · {delivery.staff_name}
              {delivery.vehicle_type ? ` · ${delivery.vehicle_type}` : ''}
              {delivery.vehicle_plate ? ` (${delivery.vehicle_plate})` : ''}
            </span>
          )}
        </p>
      )}

      {failure && <Alert className="mt-4">{failure}</Alert>}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          className="btn btn-outline btn-sm w-full sm:w-auto"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
          {open ? t("Hide details") : t("View items and bill")}
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm flex-1 sm:flex-none"
          onClick={() => onBill(order)}
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          {t("Order bill")}
        </button>
        {canConfirm && (
          <button
            type="button"
            className="btn btn-primary btn-sm flex-1 sm:flex-none"
            onClick={() => void confirm()}
            disabled={confirming}
          >
            {confirming ? <Spinner /> : <PackageCheck className="h-4 w-4" aria-hidden="true" />}
            {online ? t("Confirm delivery reception") : t("Confirm reception (syncs when online)")}
          </button>
        )}
      </div>

      {open && (
        <div className="fade-up mt-6 space-y-5 border-t border-line pt-6">
          <OrderItemsTable order={order} />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border border-line p-4">
                <h4 className="eyebrow text-muted">{t("Delivery")}</h4>
                <p className="mt-2">
                  {order.city}
                  {order.address ? ` · ${order.address}` : ''}
                </p>
                {delivery ? (
                  <dl className="mt-3 space-y-1.5 text-muted">
                    <div className="flex justify-between gap-3">
                      <dt>{t("Status")}</dt>
                      <dd className="font-medium text-ink">{t(DELIVERY_STATUS_LABEL[delivery.status])}</dd>
                    </div>
                    {delivery.staff_name && (
                      <div className="flex justify-between gap-3">
                        <dt>{t("Delivery staff")}</dt>
                        <dd className="text-end font-medium text-ink">
                          {delivery.staff_name}
                          {delivery.staff_accepted_at ? " " + t("(accepted)") : ''}
                        </dd>
                      </div>
                    )}
                    {delivery.dispatched_at && (
                      <div className="flex justify-between gap-3">
                        <dt>{t("Dispatched")}</dt>
                        <dd className="font-medium text-ink">{formatDateTime(delivery.dispatched_at)}</dd>
                      </div>
                    )}
                    {delivery.delivered_at && (
                      <div className="flex justify-between gap-3">
                        <dt>{t("Delivered")}</dt>
                        <dd className="font-medium text-ink">{formatDateTime(delivery.delivered_at)}</dd>
                      </div>
                    )}
                    {order.buyer_confirmed_at && (
                      <div className="flex justify-between gap-3">
                        <dt>{t("You confirmed")}</dt>
                        <dd className="font-medium text-ink">
                          {formatDateTime(order.buyer_confirmed_at)}
                        </dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="mt-2 text-muted">
                    {t("Delivery is arranged once Waraq Pro confirms your order.")}
                  </p>
                )}
              </div>

              {payment && (
                <div className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="eyebrow text-muted">{t("Payment")}</h4>
                    <Badge tone={PAYMENT_STATUS_TONE[payment.status]}>
                      {t(PAYMENT_STATUS_LABEL[payment.status])}
                    </Badge>
                  </div>
                  <dl className="mt-3 space-y-1.5 text-muted">
                    <div className="flex justify-between gap-3">
                      <dt>{t("Total due")}</dt>
                      <dd className="font-medium tabular-nums text-ink">{sar(payment.total_due)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>{t("Paid")}</dt>
                      <dd className="font-medium tabular-nums text-ink">{sar(payment.total_paid)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>{t("Remaining balance")}</dt>
                      <dd className="font-semibold tabular-nums text-ink">
                        {sar(round2(payment.total_due - payment.total_paid))}
                      </dd>
                    </div>
                  </dl>
                  {payment.installments.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-line pt-3">
                      {payment.installments.map((installment) => (
                        <li
                          key={installment.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span>
                            <span className="font-semibold tabular-nums text-ink">
                              {sar(installment.amount)}
                            </span>{' '}
                            <span className="text-muted">
                              · {formatDate(installment.created_at)} ·{' '}
                              {t(PAYMENT_METHOD_LABEL[installment.method])}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => onReceipt(order, installment)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold text-primary-strong hover:bg-mint"
                          >
                            <Receipt className="h-4 w-4" aria-hidden="true" />
                            {installment.receipt_number}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <OrderSummary order={order} className="lg:self-start" />
          </div>
          {order.notes && (
            <p className="rounded-xl bg-paper-deep/70 px-4 py-3 text-sm text-muted">
              <span className="font-semibold text-ink">{t("Your notes:")}</span> {order.notes}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function BuyerPortal() {
  usePageTitle(t('Buyer portal'), { noIndex: true });
  const { profile, offlineSession } = useAuth();
  const location = useLocation();
  const userId = profile?.id ?? '';
  const data = useBuyerOrders(userId);
  const [bill, setBill] = useState<Order | null>(null);
  const [receipt, setReceipt] = useState<{ order: Order; installment: Installment } | null>(null);
  const [deniedPath, setDeniedPath] = useState<string | null>(
    () => (location.state as { denied?: string } | null)?.denied ?? null,
  );

  const queuedIds = useMemo(() => new Set(data.queued.map((a) => a.orderId)), [data.queued]);
  const active = useMemo(() => data.orders.filter((o) => o.status !== 'completed'), [data.orders]);
  const past = useMemo(() => data.orders.filter((o) => o.status === 'completed'), [data.orders]);

  if (!profile) return null;

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold transition-colors ${
      isActive ? 'bg-forest text-paper' : 'text-ink/80 hover:bg-paper-deep'
    }`;

  const renderList = (list: Order[]) => (
    <ul className="space-y-4">
      {list.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          queuedConfirmation={queuedIds.has(order.id)}
          online={data.online}
          onConfirm={data.confirmReception}
          onBill={setBill}
          onReceipt={(o, installment) => setReceipt({ order: o, installment })}
        />
      ))}
    </ul>
  );

  const ordersView = (
    <div className="space-y-10">
      {data.error && <ErrorPanel message={data.error} onRetry={() => void data.sync()} />}

      {data.loading ? (
        <div className="space-y-4" role="status">
          <p className="sr-only">{t("Loading your orders")}</p>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-44 rounded-2xl" />
          ))}
        </div>
      ) : data.orders.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-card px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-mint text-primary-strong">
            {data.online ? (
              <PackageCheck className="h-7 w-7" aria-hidden="true" />
            ) : (
              <CloudOff className="h-7 w-7" aria-hidden="true" />
            )}
          </span>
          <h2 className="mt-5 text-2xl">
            {data.online ? t("No orders yet") : t("No saved orders on this device")}
          </h2>
          <p className="mt-2 max-w-md text-muted">
            {data.online
              ? t("Browse the catalogue, add products to your request list and place an order to track it here.")
              : t("You are offline and this device has not saved any of your orders yet. They will appear here after your next online visit.")}
          </p>
          {data.online && (
            <Link to="/products" className="btn btn-primary mt-6">
              {t("Browse products")}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-2xl sm:text-3xl">
              {t("Active orders")}{' '}<span className="text-muted">({active.length})</span>
            </h2>
            <div className="mt-5">
              {active.length > 0 ? (
                renderList(active)
              ) : (
                <p className="rounded-2xl border border-line bg-card p-6 text-muted">
                  {t("Nothing in progress right now.")}{' '}
                  <Link to="/products" className="font-semibold text-primary-strong underline underline-offset-4">
                    {t("Start a new order")}
                  </Link>
                  .
                </p>
              )}
            </div>
          </div>
          {past.length > 0 && (
            <div>
              <h2 className="text-2xl sm:text-3xl">
                {t("Past orders")}{' '}<span className="text-muted">({past.length})</span>
              </h2>
              <div className="mt-5">{renderList(past)}</div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Read-only: buyers can see and print, never record or change, and only for their own orders.
  const paidOrders = data.orders.filter(
    (order): order is Order & { payment: Payment } => order.payment !== null,
  );
  const paymentsView = (
    <div>
      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-line bg-paper-deep/60 p-4 text-[15px]">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          <span className="font-semibold">{t('Read-only.')}</span>{' '}
          {t('Payments are recorded by the Waraq Pro team. You can view them and print your receipts here, for your own orders only.')}
        </p>
      </div>
      {data.loading ? (
        <div className="space-y-4" role="status">
          <p className="sr-only">{t('Loading your payments')}</p>
          <div className="skeleton h-44 rounded-2xl" />
        </div>
      ) : paidOrders.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-card px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-mint text-primary-strong">
            <Receipt className="h-7 w-7" aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-2xl">{t('No payments yet')}</h2>
          <p className="mt-2 max-w-md text-muted">
            {t('A payment record appears here once one of your orders has been delivered.')}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {paidOrders.map((order) => {
            const payment = order.payment;
            return (
              <li key={payment.id} className="rounded-2xl border border-line bg-card p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="font-display text-2xl">{order.reference}</h3>
                    <Badge tone={PAYMENT_STATUS_TONE[payment.status]}>
                      {t(PAYMENT_STATUS_LABEL[payment.status])}
                    </Badge>
                  </div>
                  <Badge tone="neutral">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('Read-only')}
                  </Badge>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-paper-deep/60 p-3">
                    <dt className="text-muted">{t('Total due (incl. VAT)')}</dt>
                    <dd className="font-display text-xl tabular-nums">{sar(payment.total_due)}</dd>
                  </div>
                  <div className="rounded-xl bg-paper-deep/60 p-3">
                    <dt className="text-muted">{t('Paid')}</dt>
                    <dd className="font-display text-xl tabular-nums">{sar(payment.total_paid)}</dd>
                  </div>
                  <div className="rounded-xl bg-paper-deep/60 p-3">
                    <dt className="text-muted">{t('Remaining balance')}</dt>
                    <dd className="font-display text-xl tabular-nums text-primary-strong">
                      {sar(round2(payment.total_due - payment.total_paid))}
                    </dd>
                  </div>
                </dl>
                {payment.installments.length === 0 ? (
                  <p className="mt-4 text-sm text-muted">
                    {t('No payments have been recorded for this order yet.')}
                  </p>
                ) : (
                  <ResponsiveTable
                    nested
                    className="mt-4"
                    rows={payment.installments}
                    getRowKey={(installment) => installment.id}
                    minWidth={680}
                    columns={[
                      {
                        label: t('Receipt no.'),
                        primary: true,
                        render: (installment) => (
                          <span className="font-semibold">{installment.receipt_number}</span>
                        ),
                      },
                      {
                        label: t('Received on'),
                        render: (installment) => formatDateTime(installment.created_at),
                      },
                      { label: t('Received by'), render: (installment) => installment.receiver_name },
                      {
                        label: t('Payment method'),
                        render: (installment) => t(PAYMENT_METHOD_LABEL[installment.method]),
                      },
                      {
                        label: t('Amount'),
                        num: true,
                        render: (installment) => (
                          <span className="font-semibold">{sar(installment.amount)}</span>
                        ),
                      },
                      {
                        label: t('Balance after'),
                        num: true,
                        render: (installment) => sar(installment.balance_after),
                      },
                    ]}
                    actions={(installment) => (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setReceipt({ order, installment })}
                      >
                        <Printer className="h-4 w-4" aria-hidden="true" />
                        {t('Print receipt')}
                      </button>
                    )}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        tone="dark"
        eyebrow={t("Buyer portal")}
        title={t("Welcome, {0}", [profile.full_name.split(' ')[0]])}
        description={t("Track your orders step by step, open your VAT bills and receipts, and confirm delivery. Your orders stay available on this device when you are offline.")}
      >
        <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
          {data.online ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-bright/15 px-3.5 py-1.5 font-semibold text-primary-bright">
              <Wifi className="h-4 w-4" aria-hidden="true" />
              {t("Online · live updates")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-brass/25 px-3.5 py-1.5 font-semibold text-brass-soft">
              <WifiOff className="h-4 w-4" aria-hidden="true" />
              {t("Offline · showing saved orders")}
            </span>
          )}
          <span className="text-paper/70" role="status">
            {data.syncing
              ? t("Syncing…")
              : data.syncedAt
                ? t("Last synced {0}", [formatDateTime(data.syncedAt)])
                : t("Not synced yet")}
          </span>
          {data.queued.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1 text-paper/85">
              <Hourglass className="h-3.5 w-3.5" aria-hidden="true" />
              {data.queued.length} {data.queued.length === 1 ? t("action") : t("actions")}{' '}{t("waiting to sync")}
            </span>
          )}
          <button
            type="button"
            onClick={() => void data.sync()}
            disabled={!data.online || data.syncing}
            className="btn btn-on-dark btn-sm"
          >
            <RefreshCw className={`h-4 w-4 ${data.syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t("Refresh")}
          </button>
          <Link to="/products" className="btn btn-bright btn-sm">
            {t("New order")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </PageHeader>

      <section className="container-x py-8 lg:py-12">
        {deniedPath && (
          <div
            role="alert"
            className="mb-6 flex items-start justify-between gap-4 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-[15px] text-ink"
          >
            <p className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
              <span>
                <span className="font-semibold">{t("Access restricted.")}</span>{' '}{t("Your account has the")}{' '}
                <span className="font-semibold">{t("buyer")}</span>{' '}{t("role, so")}{' '}
                <span className="break-all font-mono text-sm">{deniedPath}</span>{' '}{t("is not available. You have been brought to your buyer portal.")}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setDeniedPath(null)}
              aria-label={t("Dismiss")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-paper-deep hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {offlineSession && (
          <Alert tone="info" className="mb-6">
            {t("You are viewing orders saved on this device. Reconnect to refresh them and to confirm deliveries straight away.")}
          </Alert>
        )}

        <nav aria-label={t("Buyer portal")} className="mb-8 flex flex-wrap gap-2 border-b border-line pb-4">
          <NavLink to="/buyer" end className={tabClass}>
            {t("My orders")}
            <span className="rounded-full bg-white/20 px-2 text-xs tabular-nums">{data.orders.length}</span>
          </NavLink>
          <NavLink to="/buyer/payments" className={tabClass}>
            {t('Payments')}
            <span className="rounded-full bg-white/20 px-2 text-xs tabular-nums">{paidOrders.length}</span>
          </NavLink>
          <NavLink to="/buyer/profile" className={tabClass}>
            {t("Profile")}
          </NavLink>
        </nav>

        <Routes>
          <Route index element={ordersView} />
          <Route path="payments" element={paymentsView} />
          <Route
            path="profile"
            element={
              <ProfilePanel>
                <div className="rounded-2xl border border-line bg-card p-6 text-sm">
                  <h3 className="flex items-center gap-2 font-sans text-base font-semibold">
                    <Database className="h-4 w-4 text-primary" aria-hidden="true" />
                    {t("Offline order history")}
                  </h3>
                  <p className="mt-2 text-muted">
                    {data.orders.length} {data.orders.length === 1 ? t("order is") : t("orders are")}{' '}{t("saved on this device for offline viewing")}
                    {data.syncedAt ? t(", last synced {0}", [formatDateTime(data.syncedAt)]) : ''}{t(". Saved orders are removed from this device when you sign out.")}
                  </p>
                  <a
                    href={whatsappLink('Hello Waraq Pro, I have a question about my order.')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-whatsapp btn-sm mt-4"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                    {t("Support on WhatsApp (")}{PHONE_DISPLAY})
                  </a>
                </div>
              </ProfilePanel>
            }
          />
          <Route path="*" element={<Navigate to="/buyer" replace />} />
        </Routes>
      </section>

      {bill && (
        <DocumentModal order={bill} sellerVatNumber={data.sellerVat} onClose={() => setBill(null)} />
      )}
      {receipt && (
        <DocumentModal
          order={receipt.order}
          installment={receipt.installment}
          sellerVatNumber={data.sellerVat}
          onClose={() => setReceipt(null)}
        />
      )}
    </>
  );
}
