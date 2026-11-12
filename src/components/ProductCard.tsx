import { Link } from 'react-router-dom';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { useRequestList } from '../contexts/RequestListContext';
import type { Product } from '../lib/types';
import QtyStepper from './QtyStepper';
import { StockBadge } from './ui';
import { t } from '../lib/i18n';

interface Props {
  product: Product;
  categoryName?: string;
  projectCategoryName?: string;
}

export default function ProductCard({ product, categoryName, projectCategoryName }: Props) {
  const { add, setQty, qtyOf } = useRequestList();
  const qty = qtyOf(product.id);
  const href = `/products/${product.slug}`;

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

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/80">
          <p>
            <span className="text-muted">{t("Sold as")}</span>{' '}
            <span className="font-semibold">{t(product.pack_unit)}</span>
          </p>
          <p className="inline-flex items-center gap-1 rounded-md bg-paper-deep px-2 py-0.5 text-xs font-semibold text-ink">
            <span className="text-muted">{t("MOQ:")}</span> {product.min_order ? t(product.min_order) : product.moq}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
          {qty > 0 ? (
            <div className="flex items-center gap-2.5">
              <QtyStepper
                value={qty}
                min={product.moq}
                onChange={(next) => setQty(product.id, next)}
                label={t(product.name)}
              />
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong">
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("In list")}
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => add(product.id, product.moq, product.name)}
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
    </article>
  );
}
