import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PackageX, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import { ErrorPanel, PageHeader, ProductCardSkeleton, usePageTitle } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useApi } from '../lib/api';
import type { Category, Product } from '../lib/types';
import { t } from '../lib/i18n';

const SORTS = [
  { value: 'featured', label: 'Featured first' },
  { value: 'name-asc', label: 'Name, A to Z' },
  { value: 'name-desc', label: 'Name, Z to A' },
  { value: 'price-asc', label: 'Price, low to high' },
  { value: 'newest', label: 'Newest first' },
];

function sortProducts(list: Product[], sort: string): Product[] {
  const copy = [...list];
  switch (sort) {
    case 'name-asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return copy.sort((a, b) => b.name.localeCompare(a.name));
    case 'price-asc':
      return copy.sort((a, b) => a.unit_price - b.unit_price || a.name.localeCompare(b.name));
    case 'newest':
      return copy.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || b.id - a.id,
      );
    default:
      return copy.sort(
        (a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name),
      );
  }
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t("Remove filter {0}", [label])}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-mint py-1 ps-3.5 pe-2.5 text-sm font-semibold text-primary-strong transition-colors hover:bg-primary hover:text-white"
    >
      {t(label)}
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

export default function Products() {
  usePageTitle(t('Products'), {
    description: t(
      'Browse paper, packaging and office supplies in Riyadh. Add items to your request list and get a clear quotation from Waraq Pro.',
    ),
  });
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const categories = useApi<Category[]>('/api/categories');
  const products = useApi<Product[]>('/api/products');

  const allCategories = useMemo(
    () => [...(categories.data ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [categories.data],
  );
  const productCategories = useMemo(
    () => allCategories.filter((c) => c.kind === 'product'),
    [allCategories],
  );
  const projectCategories = useMemo(
    () => allCategories.filter((c) => c.kind === 'project'),
    [allCategories],
  );
  const nameBySlug = useMemo(
    () => new Map(allCategories.map((c) => [c.slug, c.name])),
    [allCategories],
  );
  const list = useMemo(() => products.data ?? [], [products.data]);

  const rawCategory = params.get('category') ?? '';
  const category = allCategories.length === 0 || nameBySlug.has(rawCategory) ? rawCategory : '';
  const rawProject = params.get('project') ?? '';
  const project = allCategories.length === 0 || nameBySlug.has(rawProject) ? rawProject : '';
  const query = params.get('q') ?? '';
  const stockOnly = params.get('stock') === '1';
  const rawSort = params.get('sort') ?? 'featured';
  const sort = SORTS.some((s) => s.value === rawSort) ? rawSort : 'featured';

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    if (sort !== 'featured') next.set('sort', sort);
    setParams(next, { replace: true });
  };

  const needle = query.trim().toLowerCase();
  const searched = useMemo(
    () =>
      list.filter((product) => {
        if (stockOnly && !product.in_stock) return false;
        if (!needle) return true;
        return [
          product.name,
          product.summary,
          product.sku,
          product.min_order ?? '',
          nameBySlug.get(product.category_slug) ?? '',
          product.project_category_slug ? (nameBySlug.get(product.project_category_slug) ?? '') : '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      }),
    [list, stockOnly, needle, nameBySlug],
  );

  const countBySlug = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of searched) {
      counts.set(product.category_slug, (counts.get(product.category_slug) ?? 0) + 1);
      if (product.project_category_slug) {
        counts.set(
          product.project_category_slug,
          (counts.get(product.project_category_slug) ?? 0) + 1,
        );
      }
    }
    return counts;
  }, [searched]);

  const visible = useMemo(
    () =>
      sortProducts(
        searched.filter(
          (product) =>
            (!category || product.category_slug === category) &&
            (!project || product.project_category_slug === project),
        ),
        sort,
      ),
    [searched, category, project, sort],
  );

  const activeCount = (category ? 1 : 0) + (project ? 1 : 0) + (stockOnly ? 1 : 0) + (needle ? 1 : 0);
  const loading = products.loading || categories.loading;
  const error = products.error || categories.error;
  const retry = () => {
    if (products.error) products.reload();
    if (categories.error) categories.reload();
  };

  const option = (
    slug: string,
    label: string,
    count: number,
    param: 'category' | 'project',
    current: string,
  ): ReactNode => {
    const active = current === slug;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => update({ [param]: slug || null })}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3.5 text-start text-[15px] transition-colors ${
          active
            ? 'bg-primary font-semibold text-white'
            : 'text-ink hover:bg-paper-deep active:bg-line'
        }`}
      >
        <span>{t(label)}</span>
        <span
          className={`text-sm tabular-nums ${active ? 'text-white' : 'text-muted'}`}
          aria-label={t("{0} products", [count])}
        >
          {count}
        </span>
      </button>
    );
  };

  const filters = (
    <div className="space-y-8">
      <div>
        <h2 className="eyebrow font-sans text-muted">{t("Category")}</h2>
        <ul className="mt-3 space-y-1">
          <li>{option('', 'All products', searched.length, 'category', category)}</li>
          {productCategories.map((c) => (
            <li key={c.id}>{option(c.slug, c.name, countBySlug.get(c.slug) ?? 0, 'category', category)}</li>
          ))}
        </ul>
      </div>

      {projectCategories.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="eyebrow font-sans text-muted">{t("Project category")}</h2>
            {isAdmin && (
              <Link
                to="/admin/catalog"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-strong hover:underline"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />
                {t("Manage")}
              </Link>
            )}
          </div>
          <ul className="mt-3 space-y-1">
            <li>{option('', 'All projects', searched.length, 'project', project)}</li>
            {projectCategories.map((c) => (
              <li key={c.id}>{option(c.slug, c.name, countBySlug.get(c.slug) ?? 0, 'project', project)}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="eyebrow font-sans text-muted">{t("Availability")}</h2>
        <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl px-3.5 text-[15px] hover:bg-paper-deep">
          <span>{t("In stock only")}</span>
          <span className="relative inline-flex">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={stockOnly}
              onChange={(e) => update({ stock: e.target.checked ? '1' : null })}
            />
            <span className="h-6 w-11 rounded-full bg-line transition-colors peer-checked:bg-primary peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary" />
            <span className="absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
          </span>
        </label>
        <p className="mt-2 px-3.5 text-sm text-muted">
          {t("Items marked “On request” are sourced for you once your order is confirmed.")}
        </p>
      </div>

      {activeCount > 0 && (
        <button type="button" onClick={clearFilters} className="btn btn-outline w-full">
          <X className="h-4 w-4" aria-hidden="true" />
          {t("Clear filters")}
        </button>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        eyebrow={t("Catalogue")}
        title={t("Products")}
        description={t("Filter the catalogue by product or project category, add what you need to your request list, and place your order with a full VAT breakdown.")}
      />

      <section className="container-x py-10 lg:py-14">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <label htmlFor="product-search" className="sr-only">
              {t("Search products")}
            </label>
            <Search
              className="pointer-events-none absolute start-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <input
              id="product-search"
              type="search"
              value={query}
              onChange={(e) => update({ q: e.target.value || null })}
              placeholder={t("Search by name, category, project or code")}
              autoComplete="off"
              maxLength={80}
              className="field-input ps-11 pe-11 [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => update({ q: null })}
                aria-label={t("Clear search")}
                className="absolute end-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors hover:bg-paper-deep hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="btn btn-outline flex-1 bg-white lg:hidden"
              aria-expanded={filtersOpen}
              aria-controls="mobile-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {t("Filters")}
              {activeCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
                  {activeCount}
                </span>
              )}
            </button>
            <div className="flex-1 sm:w-52 sm:flex-none">
              <label htmlFor="product-sort" className="sr-only">
                {t("Sort products")}
              </label>
              <select
                id="product-sort"
                value={sort}
                onChange={(e) =>
                  update({ sort: e.target.value === 'featured' ? null : e.target.value })
                }
                className="field-input"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {t(s.label)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filtersOpen && (
          <div
            id="mobile-filters"
            className="fade-up mt-4 rounded-2xl border border-line bg-card p-5 lg:hidden"
          >
            {loading ? <div className="skeleton h-40" /> : filters}
          </div>
        )}

        <div className="mt-8 grid gap-10 lg:grid-cols-[260px_1fr] lg:gap-12">
          <aside className="hidden lg:block" aria-label={t("Filters")}>
            <div className="sticky top-24">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="skeleton h-11 rounded-xl" />
                  ))}
                </div>
              ) : (
                !error && filters
              )}
            </div>
          </aside>

          <div className="min-w-0">
            <h2 className="sr-only">{t("Catalogue results")}</h2>
            {error ? (
              <ErrorPanel message={error} onRetry={retry} />
            ) : loading ? (
              <>
                <div className="skeleton h-5 w-44" />
                <p className="sr-only" role="status">
                  {t("Loading products")}
                </p>
                <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <p role="status" aria-live="polite" className="text-[15px] text-muted">
                      {t("Showing")}{' '}<span className="font-semibold text-ink">{visible.length}</span>{' '}{t("of")}{' '}
                      {list.length}{' '}{t("products")}
                    </p>
                    {activeCount > 0 && (
                      <ul className="flex flex-wrap gap-2" aria-label={t("Active filters")}>
                        {category && (
                          <li>
                            <FilterChip
                              label={nameBySlug.get(category) ?? category}
                              onRemove={() => update({ category: null })}
                            />
                          </li>
                        )}
                        {project && (
                          <li>
                            <FilterChip
                              label={t("Project: {0}", [t(nameBySlug.get(project) ?? project)])}
                              onRemove={() => update({ project: null })}
                            />
                          </li>
                        )}
                        {stockOnly && (
                          <li>
                            <FilterChip label={t("In stock")} onRemove={() => update({ stock: null })} />
                          </li>
                        )}
                        {needle && (
                          <li>
                            <FilterChip
                              label={`“${query.trim()}”`}
                              onRemove={() => update({ q: null })}
                            />
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                  {isAdmin && (
                    <Link
                      to="/admin/catalog"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {t("Add or amend products")}
                    </Link>
                  )}
                </div>

                {visible.length === 0 ? (
                  <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-line bg-card px-6 py-16 text-center">
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-mint text-primary-strong">
                      <PackageX className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h2 className="mt-5 text-2xl">{t("No products match these filters")}</h2>
                    <p className="mt-2 max-w-md text-muted">
                      {t("Try a different search or category. If the item is not in the catalogue, tell us what you need and we will try to source it.")}
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                      <button type="button" onClick={clearFilters} className="btn btn-primary">
                        {t("Clear filters")}
                      </button>
                      <Link to="/contact" className="btn btn-outline">
                        {t("Ask us for it")}
                      </Link>
                    </div>
                  </div>
                ) : (
                  <ul className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map((product) => (
                      <li key={product.id} className="fade-up">
                        <ProductCard
                          product={product}
                          categoryName={nameBySlug.get(product.category_slug)}
                          projectCategoryName={
                            product.project_category_slug
                              ? nameBySlug.get(product.project_category_slug)
                              : undefined
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
