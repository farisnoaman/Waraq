import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { useRequestList } from '../contexts/RequestListContext';
import type { Product, UnitType } from '../lib/types';
import QtyStepper from './QtyStepper';
import { StockBadge } from './ui';
import { sar } from '../lib/format';
import { t } from '../lib/i18n';

interface Props {
  product: Product;
  categoryName?: string;
  projectCategoryName?: string;
}

/** MOQ is defined in units; convert it when the buyer orders by the carton. */
export function minQtyFor(product: Product, unitType: UnitType): number {
  if (unitType === 'carton' && product.units_per_carton) {
    return Math.max(1, Math.ceil(product.moq / product.units_per_carton));
  }
  return product.moq;
}

export default function ProductCard({ product, categoryName, projectCategoryName }: Props) {
  const { add, setQty, remove, qtyOf } = useRequestList();
  const hasCarton = product.carton_price != null && product.units_per_carton != null;
  const [unitType, setUnitType] = useState<UnitType>('unit');
  const qty = qtyOf(product.id, unitType);
  const minQty = minQtyFor(product, unitType);
  const href = `/products/${product.slug}`;

  const unitSelector = hasCarton && (
    <div
      role="group"
      aria-label={t("Order by")}
      className="mb-3 inline-flex rounded-full border border-line bg-white p-0.5 text-xs font-semibold"
    >
      {(['unit', 'carton'] as UnitType[]).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={unitType === option}
          onClick={() => setUnitType(option)}
          className={`rounded-full px-3.5 py-1.5 transition-colors ${
            unitType === option
              ? 'bg-primary text-white'
              : 'text-muted hover:text-ink'
          }`}
        >
          {option === 'unit' ? t("Unit") : t("Carton")}
        </button>
      ))}
    </div>
  );

  const priceTile = (active: boolean) =>
    `flex items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
      active ? 'bg-mint/60 ring-1 ring-primary/30' : 'bg-paper-deep/60'
    }`;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[box-shadow,border-color] duration-300 hover:border-primary/40 hover:shadow-[0_18px_40px_-24px_rgba(4,38,29,0.45)]">
      <Link
        to={href}
        tabIndex={-1}
        aria-hidden="true"
        className="relative block aspect-[4/3] overflow-hidden bg-paper-deep"
      >
        <img
          src={product.image}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
        />
        <span className="absolute start-3 top-3">
          <StockBadge inStock={product.in_stock} solid />
        </span>
        {projectCategoryName && (
          <span className="absolute end-3 top-3 rounded-full bg-forest/85 px-2.5 py-1 text-[11px] font-semibold text-brass-soft backdrop-blur-sm">
            {t(projectCategoryName)}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        {categoryName && <p className="eyebrow text-primary-strong">{t(categoryName)}</p>}
        <h3 className="mt-2 text-[1.35rem] leading-snug">
          <Link to={href} className="transition-colors hover:text-primary-strong">
            {t(product.name)}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-[15px] text-muted">{t(product.summary)}</p>

        {/* Prices as soft tiles; the selected unit's price lights up in mint. */}
        <div className="mt-4 space-y-2">
          <div className={priceTile(unitType === 'unit' || !hasCarton)}>
            <span className="text-muted">{t("Unit price")}</span>
            <span className="font-semibold tabular-nums text-ink">{sar(product.unit_price)}</span>
          </div>
          {hasCarton && (
            <div className={priceTile(unitType === 'carton')}>
              <span className="text-muted">
                {t("Carton")}{' '}
                <span className="text-xs">({product.units_per_carton}{' '}{t("units")})</span>
              </span>
              <span className="font-semibold tabular-nums text-ink">{sar(product.carton_price ?? 0)}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>
              {t("Sold as")}{' '}
              <span className="font-semibold text-ink/80">{t(product.pack_unit)}</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-paper-deep px-2 py-0.5 font-semibold text-ink">
              <span className="text-muted">{t("MOQ:")}</span>{' '}
              {product.min_order ? t(product.min_order) : `${product.moq} ${t("units")}`}
            </span>
          </div>
        </div>

        <div className="mt-auto pt-5">
          {unitSelector}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {qty > 0 ? (
              <div className="flex items-center gap-2.5">
                <QtyStepper
                  value={qty}
                  min={minQty}
                  onChange={(next) => setQty(product.id, unitType, next)}
                  label={`${t(product.name)} (${unitType === 'carton' ? t("Carton") : t("Unit")})`}
                />
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {t("In list")}
                </span>
                <button
                  type="button"
                  onClick={() => remove(product.id, unitType)}
                  className="inline-flex min-h-9 items-center rounded-full px-2 text-xs font-semibold text-muted transition-colors hover:bg-paper-deep hover:text-danger"
                >
                  {t("Remove")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => add(product.id, minQty, product.name, unitType)}
                aria-label={t("Add {0} to request list", [product.name])}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("Add to request")}
              </button>
            )}
            <Link
              to={href}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink underline decoration-line decoration-2 underline-offset-4 transition-colors hover:text-primary-strong hover:decoration-primary"
              aria-label={t("View details for {0}", [product.name])}
            >
              {t("Details")}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
