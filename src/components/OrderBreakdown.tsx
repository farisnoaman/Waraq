import { percent, round2, sar } from '../lib/format';
import type { Order } from '../lib/types';
import { t } from '../lib/i18n';

/**
 * Line items with the per-item VAT breakdown, used on bills, receipts and
 * order cards. Tables on screens ≥768px, a card per item on phones; when the
 * document is printed, the print rules in index.css force the table variant.
 */
export function OrderItemsTable({ order }: { order: Order }) {
  return (
    <>
      <div className="rt-table hidden overflow-x-auto rounded-xl border border-line bg-white md:block">
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
              <td className="num">
                {item.list_unit_price > item.unit_price ? (
                  <>
                    <span className="block text-xs text-muted line-through">{sar(item.list_unit_price)}</span>
                    <span className="font-semibold text-primary-strong">{sar(item.unit_price)}</span>
                  </>
                ) : (
                  sar(item.unit_price)
                )}
              </td>
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

      <ul className="rt-cards space-y-3 md:hidden">
        {order.items.map((item) => {
          const byCarton = item.unit_type === 'carton';
          const unitsPerCarton = item.units_per_carton ?? 1;
          const minCartons = Math.max(1, Math.ceil(item.moq / unitsPerCarton));
          const minDisplay = byCarton
            ? `${minCartons} ${t("cartons")} (${item.moq} ${t("units")})`
            : `${item.moq} ${t("units")}`;
          const qtyDisplay = byCarton
            ? `${item.qty} ${t("cartons")} (${item.qty * unitsPerCarton} ${t("units")})`
            : `${item.qty} ${t("units")}`;
          const discounted = item.list_unit_price > item.unit_price;
          return (
            <li key={item.id} className="overflow-hidden rounded-xl border border-line bg-white">
              {/* Tinted header band: name over the SKU. */}
              <div className="border-b border-mint bg-mint/60 px-4 py-3">
                <h4 className="font-display text-[15px] font-semibold leading-snug text-primary-strong">
                  {t(item.product_name)}
                </h4>
                <p className="mt-1 font-mono text-[11px] text-primary/70">{item.sku}</p>
              </div>

              {/* Packaging details as muted chips. */}
              <div className="flex flex-wrap gap-1.5 px-4 pt-3 pb-1">
                <span className="rounded-md bg-paper-deep/70 px-1.5 py-0.5 text-[11px] text-muted">
                  {t(item.pack_unit)}
                </span>
                {byCarton && (
                  <span className="rounded-md bg-paper-deep/70 px-1.5 py-0.5 text-[11px] text-muted">
                    {item.units_per_carton}{' '}{t("units")} / {t("carton")}
                  </span>
                )}
              </div>

              {/* Figures as dotted rows, quantities shown with their unit conversion. */}
              <dl className="px-4 py-1 text-[13px]">
                <div className="flex items-center justify-between gap-3 border-b border-dotted border-line/80 py-1.5">
                  <dt className="text-muted">{t("Minimum order (MOQ)")}</dt>
                  <dd className="font-medium tabular-nums">{minDisplay}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-dotted border-line/80 py-1.5">
                  <dt className="text-muted">{t("Ordered quantity")}</dt>
                  <dd className="font-semibold tabular-nums">{qtyDisplay}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-dotted border-line/80 py-1.5">
                  <dt className="text-muted">{t("Unit price")}</dt>
                  <dd className="tabular-nums">
                    {discounted ? (
                      <>
                        <span className="me-1 text-xs text-muted line-through">{sar(item.list_unit_price)}</span>
                        <span className="font-semibold text-primary-strong">{sar(item.unit_price)}</span>
                      </>
                    ) : (
                      sar(item.unit_price)
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-dotted border-line/80 py-1.5">
                  <dt className="text-muted">{t("Subtotal")}</dt>
                  <dd className="tabular-nums">{sar(item.line_subtotal)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-dotted border-line/80 py-1.5">
                  <dt className="flex items-center gap-1.5 text-muted">
                    {t("VAT")}{' '}
                    <span className="rounded bg-mint px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">
                      {percent(item.vat_rate)}
                    </span>
                  </dt>
                  <dd className="tabular-nums text-primary-strong">{sar(item.line_vat)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <dt className="text-[11px] text-muted">{t("VAT / item")}</dt>
                  <dd className="tabular-nums text-[11px] text-muted">{sar(item.vat_per_item)}</dd>
                </div>
              </dl>

              {/* Full-width footer band carries the line total. */}
              <div className="flex items-baseline justify-between gap-3 border-t border-line bg-paper-deep/40 px-4 py-2.5">
                <span className="text-xs font-medium text-muted">{t("Total incl. VAT")}</span>
                <span className="font-bold tabular-nums">{sar(item.line_total)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Items total, discounts, VAT total and the final payable amount. */
export function OrderSummary({ order, className = '' }: { order: Order; className?: string }) {
  // Old orders carry list_total = 0; the discount rows only appear when a
  // discount actually exists, so historic bills render exactly as before.
  const hasItemDiscounts = order.list_total > 0 && order.list_total > order.subtotal;
  const itemDiscount = hasItemDiscounts ? round2(order.list_total - order.subtotal) : 0;
  const hasPromotion = order.promotion_name != null && order.promotion_discount > 0;
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
        <dd className="font-semibold tabular-nums">{sar(hasItemDiscounts ? order.list_total : order.subtotal)}</dd>
      </div>
      {hasItemDiscounts && (
        <div className="flex justify-between gap-4 border-b border-line/70 py-1.5">
          <dt className="text-muted">{t("Item discount")}</dt>
          <dd className="font-semibold tabular-nums text-primary-strong">−{sar(itemDiscount)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-4 border-b border-line/70 py-1.5">
        <dt className="text-muted">{t("VAT total")}</dt>
        <dd className="font-semibold tabular-nums text-primary-strong">{sar(order.vat_total)}</dd>
      </div>
      {hasPromotion && (
        <div className="flex justify-between gap-4 border-b border-line/70 py-1.5">
          <dt className="text-muted">
            {t("Promotion")}{' '}
            <span className="font-semibold text-ink/80">{t(order.promotion_name ?? '')}</span>
          </dt>
          <dd className="font-semibold tabular-nums text-primary-strong">
            −{sar(order.promotion_discount)}
          </dd>
        </div>
      )}
      <div className="flex items-baseline justify-between gap-4 pt-2">
        <dt className="font-semibold text-ink">{t("Final payable total (incl. VAT)")}</dt>
        <dd className="font-display text-2xl font-semibold tabular-nums text-primary-strong">
          {sar(order.total)}
        </dd>
      </div>
    </dl>
  );
}
