import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FolderPlus, LayoutGrid, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import {
  Alert,
  Badge,
  ErrorPanel,
  SelectField,
  Spinner,
  StockBadge,
  TextAreaField,
  TextField,
} from '../../components/ui';
import { api, ApiError, errorMessage, invalidate, useApi } from '../../lib/api';
import ResponsiveTable from '../../components/ResponsiveTable';
import { percent, sar } from '../../lib/format';
import type { Category, Product, Spec } from '../../lib/types';
import { schemas, validate, type FieldErrors } from '../../lib/validation';
import { EmptyState, TabIntro } from './shared';
import { t } from '../../lib/i18n';

const IMAGE_PRESETS = [
  { label: 'A4 copy paper', url: '/images/a4-copy-paper.jpg' },
  { label: 'Coloured paper', url: '/images/coloured-paper.jpg' },
  { label: 'Thermal roll 80 x 80', url: '/images/thermal-roll-80x80.jpg' },
  { label: 'Thermal roll 80 x 67', url: '/images/thermal-roll-80x67.jpg' },
  { label: 'Thermal labels 58 x 40', url: '/images/thermal-labels-58x40.jpg' },
  { label: 'Card stock', url: '/images/card-stock.jpg' },
  { label: 'Kraft paper roll', url: '/images/kraft-roll.jpg' },
  { label: 'Plotter rolls', url: '/images/plotter-rolls.jpg' },
  { label: 'Shipping cartons', url: '/images/cartons.jpg' },
  { label: 'Kraft paper bags', url: '/images/paper-bags.jpg' },
  { label: 'Packing tape', url: '/images/packing-tape.jpg' },
  { label: 'Bubble wrap', url: '/images/bubble-wrap.jpg' },
  { label: 'Box files', url: '/images/box-files.jpg' },
  { label: 'Kraft envelopes', url: '/images/envelopes.jpg' },
  { label: 'Spiral notebooks', url: '/images/notebooks.jpg' },
  { label: 'Sticky notes', url: '/images/sticky-notes.jpg' },
  { label: 'Facial tissue', url: '/images/tissue-box.jpg' },
  { label: 'Paper towels', url: '/images/paper-towels.jpg' },
  { label: 'Paper hot cups', url: '/images/paper-cups.jpg' },
  { label: 'Takeaway food boxes', url: '/images/food-boxes.jpg' },
];

interface ProductForm {
  id: number | null;
  name: string;
  sku: string;
  category_id: string;
  project_category_id: string;
  summary: string;
  description: string;
  pack_unit: string;
  min_order: string;
  moq: string;
  unit_price: string;
  vat_rate: string;
  in_stock: boolean;
  featured: boolean;
  image: string;
  specs: Spec[];
}

interface CategoryForm {
  id: number | null;
  name: string;
  kind: 'product' | 'project';
  description: string;
  image: string;
  sort_order: string;
}

const blankProduct = (categoryId = ''): ProductForm => ({
  id: null,
  name: '',
  sku: '',
  category_id: categoryId,
  project_category_id: '',
  summary: '',
  description: '',
  pack_unit: '',
  min_order: '',
  moq: '1',
  unit_price: '',
  vat_rate: '',
  in_stock: true,
  featured: false,
  image: IMAGE_PRESETS[0].url,
  specs: [{ label: '', value: '' }],
});

const blankCategory = (kind: 'product' | 'project'): CategoryForm => ({
  id: null,
  name: '',
  kind,
  description: '',
  image: '/images/cartons.jpg',
  sort_order: '10',
});

function toForm(product: Product): ProductForm {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    category_id: String(product.category_id),
    project_category_id: product.project_category_id ? String(product.project_category_id) : '',
    summary: product.summary ?? '',
    description: product.description ?? '',
    pack_unit: product.pack_unit,
    min_order: product.min_order ?? '',
    moq: String(product.moq),
    unit_price: String(product.unit_price),
    vat_rate: product.vat_rate_override == null ? '' : String(product.vat_rate_override),
    in_stock: product.in_stock,
    featured: product.featured,
    image: product.image,
    specs: product.specs.length > 0 ? product.specs.map((s) => ({ ...s })) : [{ label: '', value: '' }],
  };
}

export default function CatalogTab() {
  const products = useApi<Product[]>('/api/products');
  const categories = useApi<Category[]>('/api/categories');
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [productForm, setProductForm] = useState<ProductForm | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const allCategories = useMemo(
    () => [...(categories.data ?? [])].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [categories.data],
  );
  const productCategories = allCategories.filter((c) => c.kind === 'product');
  const projectCategories = allCategories.filter((c) => c.kind === 'project');
  const categoryById = useMemo(() => new Map(allCategories.map((c) => [c.id, c])), [allCategories]);

  // Deep link from a product page: /admin/catalog?edit=12
  const editId = params.get('edit');
  useEffect(() => {
    if (!editId || !products.data) return;
    const target = products.data.find((p) => String(p.id) === editId);
    if (target) {
      setProductForm(toForm(target));
      setCategoryForm(null);
      setErrors({});
    }
    setParams({}, { replace: true });
  }, [editId, products.data, setParams]);

  useEffect(() => {
    if (productForm || categoryForm) {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [productForm?.id, categoryForm?.id, Boolean(productForm), Boolean(categoryForm)]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = query.trim().toLowerCase();
  const visible = (products.data ?? []).filter(
    (product) =>
      !needle ||
      [
        product.name,
        product.sku,
        product.min_order ?? '',
        categoryById.get(product.category_id)?.name ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
  );

  const closeForms = () => {
    setProductForm(null);
    setCategoryForm(null);
    setErrors({});
    setFailure(null);
  };

  const openProduct = (form: ProductForm) => {
    setNotice(null);
    setFailure(null);
    setErrors({});
    setCategoryForm(null);
    setProductForm(form);
  };

  const openCategory = (form: CategoryForm) => {
    setNotice(null);
    setFailure(null);
    setErrors({});
    setProductForm(null);
    setCategoryForm(form);
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!productForm || saving) return;
    setFailure(null);
    const specs = productForm.specs.filter((s) => s.label.trim() || s.value.trim());
    const result = validate(schemas.product, { ...productForm, specs });
    if (!result.ok) {
      setErrors(result.errors);
      setFailure(t("Please check the highlighted fields."));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api('/api/products', {
        method: productForm.id ? 'PUT' : 'POST',
        body: productForm.id ? { ...result.data, id: productForm.id } : result.data,
      });
      invalidate('/api/products');
      setNotice(t("{0} has been {1}.", [result.data.name, productForm.id ? t("updated") : t("added to the catalogue")]));
      setProductForm(null);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      setFailure(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!categoryForm || saving) return;
    setFailure(null);
    const result = validate(schemas.category, categoryForm);
    if (!result.ok) {
      setErrors(result.errors);
      setFailure(t("Please check the highlighted fields."));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api('/api/categories', {
        method: categoryForm.id ? 'PUT' : 'POST',
        body: categoryForm.id ? { ...result.data, id: categoryForm.id } : result.data,
      });
      invalidate('/api/categories');
      invalidate('/api/products');
      setNotice(t("{0} has been {1}.", [result.data.name, categoryForm.id ? t("updated") : t("added")]));
      setCategoryForm(null);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
      setFailure(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind: 'products' | 'categories', id: number, name: string) => {
    if (!window.confirm(t("Delete “{0}”? This cannot be undone.", [name]))) return;
    setDeleting(`${kind}-${id}`);
    setFailure(null);
    setNotice(null);
    try {
      await api(`/api/${kind}`, { method: 'DELETE', body: { id } });
      invalidate('/api/products');
      invalidate('/api/categories');
      setNotice(t("{0} has been deleted.", [name]));
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  const setP = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setProductForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: '' }));
  };
  const setC = <K extends keyof CategoryForm>(key: K, value: CategoryForm[K]) => {
    setCategoryForm((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const loading = products.loading || categories.loading;
  const loadError = products.error || categories.error;

  return (
    <div>
      <TabIntro title={t("Catalog and MOQ")}>
        {t("Manage products, their minimum order quantity (MOQ), prices and categories. Changes appear on the public catalogue straight away.")}
      </TabIntro>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:w-96">
          <label htmlFor="catalog-search" className="sr-only">
            {t("Search the catalogue")}
          </label>
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            id="catalog-search"
            type="search"
            className="field-input field-sm ps-10"
            placeholder={t("Search by name, SKU, MOQ or category")}
            maxLength={80}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => openProduct(blankProduct(productCategories[0] ? String(productCategories[0].id) : ''))}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("Add product")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => openCategory(blankCategory('product'))}>
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            {t("Add product category")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => openCategory(blankCategory('project'))}>
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
            {t("Add project category")}
          </button>
        </div>
      </div>

      {notice && (
        <Alert tone="success" className="mt-5">
          {notice}
        </Alert>
      )}
      {failure && !productForm && !categoryForm && <Alert className="mt-5">{failure}</Alert>}

      <div ref={formRef} className="scroll-mt-36">
        {productForm && (
          <form
            onSubmit={saveProduct}
            noValidate
            className="fade-up mt-6 rounded-2xl border border-primary/30 bg-card p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-2xl">{productForm.id ? t("Edit {0}", [productForm.name || t("product")]) : t("New product")}</h3>
              <button
                type="button"
                onClick={closeForms}
                aria-label={t("Close form")}
                className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-paper-deep hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2">
                <TextField
                  id="pf-name"
                  label={t("Product name")}
                  required
                  maxLength={140}
                  value={productForm.name}
                  onChange={(e) => setP('name', e.target.value)}
                  error={errors.name}
                />
              </div>
              <TextField
                id="pf-sku"
                label={t("SKU code")}
                required
                maxLength={40}
                placeholder="WQ-CP-A480"
                value={productForm.sku}
                onChange={(e) => setP('sku', e.target.value.toUpperCase())}
                error={errors.sku}
              />
              <SelectField
                id="pf-category"
                label={t("Product category")}
                required
                value={productForm.category_id}
                onChange={(e) => setP('category_id', e.target.value)}
                error={errors.category_id ? t("Choose a product category.") : undefined}
              >
                <option value="">{t("Choose…")}</option>
                {productCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t(c.name)}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="pf-project"
                label={t("Project category")}
                value={productForm.project_category_id}
                onChange={(e) => setP('project_category_id', e.target.value)}
                error={errors.project_category_id}
              >
                <option value="">{t("None / general")}</option>
                {projectCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t(c.name)}
                  </option>
                ))}
              </SelectField>
              <TextField
                id="pf-pack"
                label={t("Sold as (pack unit)")}
                required
                maxLength={80}
                placeholder={t("Box of 5 reams")}
                value={productForm.pack_unit}
                onChange={(e) => setP('pack_unit', e.target.value)}
                error={errors.pack_unit}
              />
              <TextField
                id="pf-moq"
                label={t("Minimum order quantity (MOQ)")}
                required
                inputMode="numeric"
                value={productForm.moq}
                onChange={(e) => setP('moq', e.target.value.replace(/\D/g, '').slice(0, 6))}
                error={errors.moq}
                hint={t("Buyers cannot order fewer than this.")}
              />
              <TextField
                id="pf-minorder"
                label={t("MOQ display label")}
                maxLength={60}
                placeholder={t("e.g. 3 boxes")}
                value={productForm.min_order}
                onChange={(e) => setP('min_order', e.target.value)}
                error={errors.min_order}
                hint={t("Shown on the catalogue.")}
              />
              <TextField
                id="pf-price"
                label={t("Unit price excl. VAT (SAR)")}
                required
                inputMode="decimal"
                value={productForm.unit_price}
                onChange={(e) => setP('unit_price', e.target.value.replace(/[^\d.]/g, '').slice(0, 10))}
                error={errors.unit_price}
              />
              <TextField
                id="pf-vat"
                label={t("VAT percentage (%)")}
                inputMode="decimal"
                placeholder={t("Default from Settings")}
                value={productForm.vat_rate}
                onChange={(e) => setP('vat_rate', e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
                error={errors.vat_rate}
                hint={t("Leave empty to use the default VAT.")}
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <TextField
                  id="pf-summary"
                  label={t("Short summary")}
                  required
                  maxLength={300}
                  value={productForm.summary}
                  onChange={(e) => setP('summary', e.target.value)}
                  error={errors.summary}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <TextAreaField
                  id="pf-description"
                  label={t("Full description")}
                  rows={3}
                  maxLength={3000}
                  value={productForm.description}
                  onChange={(e) => setP('description', e.target.value)}
                  error={errors.description}
                />
              </div>
              <div className="sm:col-span-2">
                <TextField
                  id="pf-image"
                  label={t("Image address")}
                  required
                  maxLength={400}
                  value={productForm.image}
                  onChange={(e) => setP('image', e.target.value)}
                  error={errors.image}
                  hint={t("A /images/… path or an https:// address.")}
                />
              </div>
              <SelectField
                id="pf-preset"
                label={t("Or choose a photo")}
                value={IMAGE_PRESETS.some((p) => p.url === productForm.image) ? productForm.image : ''}
                onChange={(e) => e.target.value && setP('image', e.target.value)}
              >
                <option value="">{t("Custom address")}</option>
                {IMAGE_PRESETS.map((preset) => (
                  <option key={preset.url} value={preset.url}>
                    {t(preset.label)}
                  </option>
                ))}
              </SelectField>
            </div>

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold">{t("Specifications")}</legend>
              <div className="mt-2 space-y-2">
                {productForm.specs.map((spec, index) => (
                  <div key={index} className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="field-input field-sm sm:w-56"
                      placeholder={t("Label, e.g. Size")}
                      aria-label={t("Specification {0} label", [index + 1])}
                      maxLength={60}
                      value={spec.label}
                      onChange={(e) =>
                        setP(
                          'specs',
                          productForm.specs.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)),
                        )
                      }
                    />
                    <input
                      className="field-input field-sm flex-1"
                      placeholder={t("Value, e.g. A4 (210 x 297 mm)")}
                      aria-label={t("Specification {0} value", [index + 1])}
                      maxLength={160}
                      value={spec.value}
                      onChange={(e) =>
                        setP(
                          'specs',
                          productForm.specs.map((s, i) => (i === index ? { ...s, value: e.target.value } : s)),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label={t("Remove specification {0}", [index + 1])}
                      onClick={() => setP('specs', productForm.specs.filter((_, i) => i !== index))}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              {errors.specs && <p className="mt-1.5 text-sm font-medium text-danger">{errors.specs}</p>}
              <button
                type="button"
                className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary-strong hover:underline"
                onClick={() => setP('specs', [...productForm.specs, { label: '', value: '' }])}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("Add specification")}
              </button>
            </fieldset>

            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px]">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={productForm.in_stock}
                  onChange={(e) => setP('in_stock', e.target.checked)}
                />
                {t("In stock")}
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px]">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={productForm.featured}
                  onChange={(e) => setP('featured', e.target.checked)}
                />
                {t("Featured on the home page")}
              </label>
            </div>

            {failure && <Alert className="mt-5">{failure}</Alert>}

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <Spinner />}
                {productForm.id ? t("Save changes") : t("Add product")}
              </button>
              <button type="button" className="btn btn-outline" onClick={closeForms}>
                {t("Cancel")}
              </button>
            </div>
          </form>
        )}

        {categoryForm && (
          <form
            onSubmit={saveCategory}
            noValidate
            className="fade-up mt-6 rounded-2xl border border-primary/30 bg-card p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-2xl">{categoryForm.id ? t("Edit {0}", [categoryForm.name || t("category")]) : t("New category")}</h3>
              <button
                type="button"
                onClick={closeForms}
                aria-label={t("Close form")}
                className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-paper-deep hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <TextField
                id="cf-name"
                label={t("Category name")}
                required
                maxLength={80}
                value={categoryForm.name}
                onChange={(e) => setC('name', e.target.value)}
                error={errors.name}
              />
              <SelectField
                id="cf-kind"
                label={t("Category type")}
                required
                value={categoryForm.kind}
                onChange={(e) => setC('kind', e.target.value as 'product' | 'project')}
                error={errors.kind}
              >
                <option value="product">{t("Product category (main catalogue)")}</option>
                <option value="project">{t("Project category (catalogue filter)")}</option>
              </SelectField>
              <SelectField
                id="cf-image"
                label={t("Photo")}
                required
                value={categoryForm.image}
                onChange={(e) => setC('image', e.target.value)}
                error={errors.image}
              >
                {!IMAGE_PRESETS.some((p) => p.url === categoryForm.image) && (
                  <option value={categoryForm.image}>{categoryForm.image}</option>
                )}
                {IMAGE_PRESETS.map((preset) => (
                  <option key={preset.url} value={preset.url}>
                    {t(preset.label)}
                  </option>
                ))}
              </SelectField>
              <TextField
                id="cf-sort"
                label={t("Sort order")}
                required
                inputMode="numeric"
                value={categoryForm.sort_order}
                onChange={(e) => setC('sort_order', e.target.value.replace(/\D/g, '').slice(0, 4))}
                error={errors.sort_order}
                hint={t("Lower numbers appear first.")}
              />
              <div className="sm:col-span-2">
                <TextAreaField
                  id="cf-description"
                  label={t("Description")}
                  rows={2}
                  maxLength={300}
                  value={categoryForm.description}
                  onChange={(e) => setC('description', e.target.value)}
                  error={errors.description}
                />
              </div>
            </div>
            {failure && <Alert className="mt-5">{failure}</Alert>}
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <Spinner />}
                {categoryForm.id ? t("Save category") : t("Add category")}
              </button>
              <button type="button" className="btn btn-outline" onClick={closeForms}>
                {t("Cancel")}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6">
        {loadError ? (
          <ErrorPanel
            message={loadError}
            onRetry={() => {
              products.reload();
              categories.reload();
            }}
          />
        ) : loading ? (
          <div className="space-y-2" role="status">
            <p className="sr-only">{t("Loading the catalogue")}</p>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {visible.length === 0 ? (
              <EmptyState icon={LayoutGrid} title={needle ? t("No products match") : t("The catalogue is empty")}>
                {needle ? t("Try a different name, SKU or category.") : t("Add your first product to get started.")}
              </EmptyState>
            ) : (
              <ResponsiveTable
                rows={visible}
                getRowKey={(product) => product.id}
                minWidth={860}
                columns={[
                  {
                    label: t("Product"),
                    primary: true,
                    render: (product) => (
                      <div className="flex items-center gap-3">
                        <img
                          src={product.image}
                          alt=""
                          loading="lazy"
                          className="h-12 w-12 shrink-0 rounded-lg object-cover"
                        />
                        <div>
                          <p className="font-semibold">{t(product.name)}</p>
                          <p className="text-xs text-muted">
                            {product.sku} · {t(product.pack_unit)}
                          </p>
                        </div>
                      </div>
                    ),
                  },
                  {
                    label: t("Category / project"),
                    render: (product) => (
                      <>
                        <p>{t(categoryById.get(product.category_id)?.name ?? '—')}</p>
                        {product.project_category_id && (
                          <p className="text-xs text-muted">
                            {t("Project:")}{' '}{categoryById.get(product.project_category_id)?.name}
                          </p>
                        )}
                      </>
                    ),
                  },
                  {
                    label: t("Unit price and VAT"),
                    num: true,
                    render: (product) => (
                      <>
                        <p className="font-semibold">{sar(product.unit_price)}</p>
                        <p className="text-xs text-muted">
                          + {percent(product.vat_rate)}{' '}{t("VAT (")}{sar(product.vat_value)})
                        </p>
                      </>
                    ),
                  },
                  {
                    label: t("MOQ"),
                    num: true,
                    render: (product) => (
                      <>
                        <p className="font-semibold">{product.moq}</p>
                        {product.min_order && <p className="text-xs text-muted">{t(product.min_order)}</p>}
                      </>
                    ),
                  },
                  {
                    label: t("Status"),
                    render: (product) => (
                      <div className="flex flex-wrap gap-1.5">
                        <StockBadge inStock={product.in_stock} />
                        {product.featured && <Badge tone="brass">{t("Featured")}</Badge>}
                      </div>
                    ),
                  },
                ]}
                actions={(product) => (
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => openProduct(toForm(product))}
                      aria-label={t("Edit {0}", [product.name])}
                      className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-mint hover:text-primary-strong"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove('products', product.id, product.name)}
                      disabled={deleting !== null}
                      aria-label={t("Delete {0}", [product.name])}
                      className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                      {deleting === `products-${product.id}` ? (
                        <Spinner />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                )}
              />
            )}

            <h3 className="mt-10 text-2xl">
              {t("Categories")}{' '}<span className="text-muted">({allCategories.length})</span>
            </h3>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {allCategories.map((category) => {
                const used = (products.data ?? []).filter(
                  (p) => p.category_id === category.id || p.project_category_id === category.id,
                ).length;
                return (
                  <li
                    key={category.id}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3"
                  >
                    <img
                      src={category.image}
                      alt=""
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{t(category.name)}</p>
                      <p className="text-xs text-muted">
                        {category.kind === 'product' ? t("Product category") : t("Project category")} · {used}{' '}
                        {used === 1 ? t("product") : t("products")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openCategory({
                          id: category.id,
                          name: category.name,
                          kind: category.kind,
                          description: category.description ?? '',
                          image: category.image,
                          sort_order: String(category.sort_order),
                        })
                      }
                      aria-label={t("Edit {0}", [category.name])}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-mint hover:text-primary-strong"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove('categories', category.id, category.name)}
                      disabled={deleting !== null}
                      aria-label={t("Delete {0}", [category.name])}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                      {deleting === `categories-${category.id}` ? (
                        <Spinner />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
