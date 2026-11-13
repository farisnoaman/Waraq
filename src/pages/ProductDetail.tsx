import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import QtyStepper from '../components/QtyStepper';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { ErrorPanel, StockBadge, usePageTitle } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useRequestList } from '../contexts/RequestListContext';
import { useApi } from '../lib/api';
import { percent, sar } from '../lib/format';
import { PHONE_DISPLAY, whatsappLink } from '../lib/site';
import type { Category, Product } from '../lib/types';
import { t } from '../lib/i18n';

const ROW = 'grid grid-cols-[9rem_1fr] gap-4 border-b border-line py-3.5 sm:grid-cols-[11rem_1fr]';

export default function ProductDetail() {
  const { slug } = useParams();
  const { profile } = useAuth();
  const products = useApi<Product[]>('/api/products');
  const categories = useApi<Category[]>('/api/categories');
  const { add, setQty, remove, qtyOf } = useRequestList();

  const product = useMemo(
    () => products.data?.find((p) => p.slug === slug) ?? null,
    [products.data, slug],
  );
  const category = useMemo(
    () => categories.data?.find((c) => c.slug === product?.category_slug) ?? null,
    [categories.data, product],
  );
  const projectCategory = useMemo(
    () =>
      product?.project_category_slug
        ? (categories.data?.find((c) => c.slug === product.project_category_slug) ?? null)
        : null,
    [categories.data, product],
  );
  const related = useMemo(
    () =>
      product
        ? (products.data ?? [])
            .filter((p) => p.category_slug === product.category_slug && p.id !== product.id)
            .slice(0, 3)
        : [],
    [products.data, product],
  );

  const moq = product?.moq ?? 1;
  const [draftQty, setDraftQty] = useState(moq);
  useEffect(() => {
    setDraftQty(moq);
  }, [slug, moq]);

  usePageTitle(t(product?.name ?? 'Product'), {
    description: product
      ? t(product.description || product.summary)
      : t('Paper, packaging and office supply in Jeddah.'),
    image: product?.image ? `https://waraq.pro${product.image}` : undefined,
  });

  if (products.error) {
    return (
      <section className="container-x py-16">
        <ErrorPanel message={products.error} onRetry={products.reload} />
      </section>
    );
  }

  if (products.loading) {
    return (
      <section className="container-x py-8 lg:py-12">
        <p className="sr-only" role="status">
          {t("Loading product")}
        </p>
        <div className="flex h-[3.875rem] items-center lg:h-9">
          <div className="skeleton h-4 w-64" />
        </div>
        <div className="mt-6 grid min-h-[90.25rem] grid-cols-1 gap-10 lg:min-h-[58rem] lg:grid-cols-2">
          <div className="skeleton aspect-[4/3] rounded-2xl" />
          <div className="min-h-[70rem] space-y-4 lg:min-h-[57.5rem]">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-12 w-4/5" />
            <div className="skeleton h-5 w-full" />
            <div className="skeleton h-5 w-11/12" />
            <div className="skeleton h-40 w-full" />
            <div className="skeleton h-11 w-56 rounded-full" />
          </div>
        </div>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="container-x py-24 text-center">
        <p className="eyebrow text-primary-strong">{t("Not found")}</p>
        <h1 className="mt-4 text-4xl sm:text-5xl">{t("We could not find that product")}</h1>
        <p className="mx-auto mt-4 max-w-md text-muted">
          {t("It may have been renamed or removed from the catalogue.")}
        </p>
        <Link to="/products" className="btn btn-primary mt-8">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("Back to products")}
        </Link>
      </section>
    );
  }

  const inList = qtyOf(product.id);

  return (
    <>
      <section className="container-x py-8 lg:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <nav aria-label={t("Breadcrumb")}>
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
              <li>
                <Link
                  to="/products"
                  className="inline-flex min-h-9 items-center hover:text-primary-strong"
                >
                  {t("Products")}
                </Link>
              </li>
              {category && (
                <>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  <li>
                    <Link
                      to={`/products?category=${category.slug}`}
                      className="inline-flex min-h-9 items-center hover:text-primary-strong"
                    >
                      {t(category.name)}
                    </Link>
                  </li>
                </>
              )}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              <li aria-current="page" className="font-medium text-ink">
                {t(product.name)}
              </li>
            </ol>
          </nav>
          {profile?.role === 'admin' && (
            <Link
              to={`/admin/catalog?edit=${product.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-primary hover:text-primary-strong"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Amend in Admin")}
            </Link>
          )}
        </div>

        <div className="mt-6 grid min-h-[90.25rem] grid-cols-1 gap-10 lg:min-h-[58rem] lg:grid-cols-2 lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-line bg-paper-deep">
              <img
                src={product.image}
                alt={t(product.name)}
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-3">
              {category && <p className="eyebrow text-primary-strong">{t(category.name)}</p>}
              {projectCategory && (
                <Link
                  to={`/products?project=${projectCategory.slug}`}
                  className="rounded-full bg-forest px-2.5 py-1 text-xs font-semibold text-brass-soft transition-colors hover:bg-forest-soft"
                >
                  {t("Project:")}{' '}{t(projectCategory.name)}
                </Link>
              )}
              <StockBadge inStock={product.in_stock} />
            </div>
            <h1 className="mt-4 text-4xl leading-[1.08] sm:text-5xl">{t(product.name)}</h1>
            <p className="mt-2 text-sm text-muted">
              {t("Code")}{' '}<span className="font-semibold tracking-wide text-ink">{product.sku}</span>
            </p>
            <p className="mt-6 text-lg text-ink/85">{t(product.description || product.summary)}</p>

            <dl className="mt-8 border-t border-line">
              {product.specs.map((spec) => (
                <div key={spec.label} className={ROW}>
                  <dt className="text-muted">{t(spec.label)}</dt>
                  <dd className="font-medium">{t(spec.value)}</dd>
                </div>
              ))}
              <div className={ROW}>
                <dt className="text-muted">{t("Sold as")}</dt>
                <dd className="font-medium">{t(product.pack_unit)}</dd>
              </div>
              <div className={ROW}>
                <dt className="text-muted">{t("Minimum order (MOQ)")}</dt>
                <dd className="font-semibold text-primary-strong">
                  {product.min_order ? t(product.min_order) : `${product.moq} × ${t(product.pack_unit)}`}
                </dd>
              </div>
              <div className={ROW}>
                <dt className="text-muted">{t("Unit price")}</dt>
                <dd>
                  <span className="font-semibold">{sar(product.unit_price)}</span>{' '}
                  <span className="text-muted">
                    + {percent(product.vat_rate)}{' '}{t("VAT (")}{sar(product.vat_value)}) ={' '}
                    {sar(product.price_incl_vat)}
                  </span>
                </dd>
              </div>
              {projectCategory && (
                <div className={ROW}>
                  <dt className="text-muted">{t("Project category")}</dt>
                  <dd className="font-medium">{t(projectCategory.name)}</dd>
                </div>
              )}
            </dl>

            <div className="mt-8 rounded-2xl border border-line bg-card p-5 sm:p-6">
              {inList > 0 ? (
                <>
                  <p className="flex items-center gap-2 font-semibold text-primary-strong">
                    <Check className="h-5 w-5" aria-hidden="true" />
                    {t("In your request list")}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <QtyStepper
                      value={inList}
                      min={product.moq}
                      onChange={(next) => setQty(product.id, next)}
                      label={t(product.name)}
                    />
                    <Link to="/request" className="btn btn-primary">
                      {t("View request list")}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => remove(product.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-paper-deep hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      {t("Remove")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-ink">
                    {t("Quantity")}{' '}
                    <span className="font-normal text-muted">
                      ({t(product.pack_unit)}{' '}{t("· minimum")}{' '}{product.moq})
                    </span>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <QtyStepper
                      value={draftQty}
                      min={product.moq}
                      onChange={setDraftQty}
                      label={t(product.name)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => add(product.id, draftQty, product.name)}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {t("Add to request list")}
                    </button>
                    <a
                      href={whatsappLink(
                        `Hello Waraq Pro, I would like to enquire about: ${t(product.name)} (${product.sku}) - Qty: ${draftQty} (${t(product.pack_unit)}).`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline bg-white"
                    >
                      <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                      {t("Ask on WhatsApp (")}{PHONE_DISPLAY})
                    </a>
                  </div>
                </>
              )}
              <p className="mt-4 text-sm text-muted">
                {t("Prices exclude VAT. VAT is shown for every item on your order bill.")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="border-t border-line bg-card">
          <div className="container-x py-16 lg:py-20">
            <h2 className="text-3xl sm:text-4xl">
              {t("More in")}{' '}{category ? t(category.name) : t("this category")}
            </h2>
            <ul className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <li key={item.id}>
                  <ProductCard product={item} categoryName={category?.name} />
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
