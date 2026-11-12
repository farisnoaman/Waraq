import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  PackageOpen,
  Printer,
  Search,
  Truck,
} from 'lucide-react';
import DocumentModal from '../../components/DocumentModal';
import { OrderItemsTable, OrderSummary } from '../../components/OrderBreakdown';
import { Alert, Badge, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import {
  DELIVERY_STATUS_LABEL,
  formatDateTime,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_SHORT,
  ORDER_STATUS_TONE,
  ORDER_STATUSES,
  sar,
  ltr,
} from '../../lib/format';
import type { Order, OrderStatus } from '../../lib/types';
import { EmptyState, TabIntro, useAction, type OpsProps } from './shared';
import { t } from '../../lib/i18n';

export default function OrdersTab({ orders, sellerVat, isAdmin, reload }: OpsProps) {
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [bill, setBill] = useState<Order | null>(null);
  const action = useAction(reload);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const order of orders) map.set(order.status, (map.get(order.status) ?? 0) + 1);
    return map;
  }, [orders]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orders.filter((order) => {
      if (filter !== 'all' && order.status !== filter) return false;
      if (!needle) return true;
      return [order.reference, order.buyer_name, order.buyer_company ?? '', order.buyer_email, order.city]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [orders, filter, query]);

  const toggle = (id: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const act = (order: Order, name: 'confirm' | 'prepare') =>
    action.run(`${name}-${order.id}`, () =>
      api('/api/orders', { method: 'PUT', body: { id: order.id, action: name } }),
    );

  const chip = (value: 'all' | OrderStatus, label: string, count: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors ${
        filter === value ? 'bg-primary text-white' : 'bg-paper-deep text-ink hover:bg-line'
      }`}
    >
      {t(label)}
      <span className={`tabular-nums ${filter === value ? 'text-white/85' : 'text-muted'}`}>{count}</span>
    </button>
  );

  return (
    <div>
      <TabIntro title={t("Orders")}>
        {isAdmin
          ? t("Review incoming orders, confirm receipt and start preparation. Confirming an order automatically creates a draft delivery in the Deliveries tab.")
          : t("Orders for the deliveries assigned to you. Only an administrator can confirm or prepare orders.")}
      </TabIntro>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("Filter by status")}>
          {chip('all', 'All', orders.length)}
          {ORDER_STATUSES.map((status) => chip(status, t(ORDER_STATUS_SHORT[status]), counts.get(status) ?? 0))}
        </div>
        <div className="relative lg:w-72">
          <label htmlFor="order-search" className="sr-only">
            {t("Search orders")}
          </label>
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="order-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Reference, buyer or city")}
            maxLength={80}
            className="field-input field-sm ps-10"
          />
        </div>
      </div>

      {action.error && <Alert className="mt-5">{action.error}</Alert>}

      <div className="mt-6">
        {orders.length === 0 ? (
          <EmptyState icon={ClipboardList} title={t("No orders yet")}>
            {isAdmin
              ? t("Orders placed by buyers from the request list appear here.")
              : t("Orders appear here once an administrator assigns you a delivery.")}
          </EmptyState>
        ) : visible.length === 0 ? (
          <EmptyState icon={Search} title={t("No orders match")}>
            {t("Try a different status or search term.")}
          </EmptyState>
        ) : (
          <ul className="space-y-4">
            {visible.map((order) => {
              const expanded = open.has(order.id);
              return (
                <li key={order.id} className="rounded-2xl border border-line bg-card p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="font-display text-2xl tracking-wide">{order.reference}</h3>
                        <Badge tone={ORDER_STATUS_TONE[order.status]}>
                          {t(ORDER_STATUS_LABEL[order.status])}
                        </Badge>
                        {order.buyer_confirmed_at && (
                          <Badge tone="mint">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("Buyer confirmed reception")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1.5 text-[15px]">
                        <span className="font-semibold">{order.buyer_name}</span>
                        {order.buyer_company ? ` · ${order.buyer_company}` : ''}
                      </p>
                      <p className="break-all text-sm text-muted">
                        {order.buyer_email}
                        {order.buyer_phone ? ` · ${ltr(order.buyer_phone)}` : ''}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {order.city}
                        {order.address ? ` · ${order.address}` : ''}{' '}{t("· placed")}{' '}
                        {formatDateTime(order.created_at)}
                      </p>
                      {order.delivery && (
                        <p className="mt-1 text-sm text-muted">
                          {t("Delivery:")}{' '}{t(DELIVERY_STATUS_LABEL[order.delivery.status])}
                          {order.delivery.staff_name ? ` · ${order.delivery.staff_name}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-start sm:text-end">
                      <p className="text-xs uppercase tracking-wider text-muted">
                        {t("Final payable (incl. VAT)")}
                      </p>
                      <p className="font-display text-2xl font-semibold text-primary-strong">
                        {sar(order.total)}
                      </p>
                      <p className="text-sm text-muted">
                        {order.items.length} {order.items.length === 1 ? t("line") : t("lines")} ·{' '}
                        {order.total_units}{' '}{t("units")}
                      </p>
                    </div>
                  </div>

                  {order.notes && (
                    <p className="mt-4 rounded-xl bg-paper-deep/70 px-4 py-3 text-sm text-muted">
                      <span className="font-semibold text-ink">{t("Buyer notes:")}</span> {order.notes}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      aria-expanded={expanded}
                      onClick={() => toggle(order.id)}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                      {expanded ? t("Hide items") : t("Items and VAT")}
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setBill(order)}>
                      <Printer className="h-4 w-4" aria-hidden="true" />
                      {t("Print order bill")}
                    </button>
                    {isAdmin && order.status === 'pending' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={action.busy !== null}
                        onClick={() => void act(order, 'confirm')}
                      >
                        {action.busy === `confirm-${order.id}` ? (
                          <Spinner />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        )}
                        {t("Confirm order")}
                      </button>
                    )}
                    {isAdmin && order.status === 'confirmed' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={action.busy !== null}
                        onClick={() => void act(order, 'prepare')}
                      >
                        {action.busy === `prepare-${order.id}` ? (
                          <Spinner />
                        ) : (
                          <PackageOpen className="h-4 w-4" aria-hidden="true" />
                        )}
                        {t("Start preparation")}
                      </button>
                    )}
                    {order.delivery && (
                      <Link to="/admin/deliveries" className="btn btn-dark btn-sm">
                        <Truck className="h-4 w-4" aria-hidden="true" />
                        {isAdmin ? t("Manage delivery") : t("Open delivery")}
                      </Link>
                    )}
                  </div>

                  {expanded && (
                    <div className="fade-up mt-6 space-y-5 border-t border-line pt-6">
                      <OrderItemsTable order={order} />
                      <OrderSummary order={order} className="sm:ms-auto sm:max-w-md" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {bill && <DocumentModal order={bill} sellerVatNumber={sellerVat} onClose={() => setBill(null)} />}
    </div>
  );
}
