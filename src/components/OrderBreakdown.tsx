import { percent, sar } from '../lib/format';
import type { Order } from '../lib/types';
import { t } from '../lib/i18n';

/** Line items with the per-item VAT breakdown used on bills, receipts and order cards. */
export function OrderItemsTable({ order }: { order: Order }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="data-table min-w-[640px]">
        <thead>
          <tr>
            <th scope="col">{t("Item")}</th>
            <th scope="col" className="num">
              {t("Qty")}
            </th>
            <th scope="col" className="num">
              {t("Unit price")}
            </th>
            <th scope="col" className="num">
              {t("Subtotal")}
            </th>
            <th scope="col" className="num">
              {t("VAT %")}
            </th>
            <th scope="col" className="num">
              {t("VAT / item")}
            </th>
            <th scope="col" className="num">
              {t("VAT value")}
            </th>
            <th scope="col" className="num">
              {t("Total incl. VAT")}
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id}>
              <td>
                <p className="font-semibold text-ink">{t(item.product_name)}</p>
                <p className="text-xs text-muted">
                  {item.sku} · {t(item.pack_unit)}{' '}{t("· MOQ")}{' '}{item.moq}
                </p>
              </td>
              <td className="num font-semibold">{item.qty}</td>
              <td className="num">{sar(item.unit_price)}</td>
              <td className="num">{sar(item.line_subtotal)}</td>
              <td className="num font-semibold text-primary-strong">{percent(item.vat_rate)}</td>
              <td className="num text-muted">{sar(item.vat_per_item)}</td>
              <td className="num">{sar(item.line_vat)}</td>
              <td className="num font-bold">{sar(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Items total, VAT total and the final payable amount. */
export function OrderSummary({ order, className = '' }: { order: Order; className?: string }) {
  return (
    <dl className={`rounded-xl border border-primary/30 bg-mint/40 p-4 text-sm sm:p-5 ${className}`}>
      <div className="flex justify-between gap-4 border-b border-line/70 pb-1.5">
        <dt className="text-muted">{t("Items")}</dt>
        <dd className="font-semibold tabular-nums">
          {order.items.length} {order.items.length === 1 ? t("line") : t("lines")} · {order.total_units}{' '}
          {t("units")}
        </dd>
      </div>
      <div className="flex justify-between gap-4 border-b border-line/70 py-1.5">
        <dt className="text-muted">{t("Items total (excl. VAT)")}</dt>
        <dd className="font-semibold tabular-nums">{sar(order.subtotal)}</dd>
      </div>
      <div className="flex justify-between gap-4 border-b border-line/70 py-1.5">
        <dt className="text-muted">{t("VAT total")}</dt>
        <dd className="font-semibold tabular-nums text-primary-strong">{sar(order.vat_total)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 pt-2">
        <dt className="font-semibold text-ink">{t("Final payable total (incl. VAT)")}</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-primary-strong">
          {sar(order.total)}
        </dd>
      </div>
    </dl>
  );
}
