import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Percent, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Alert, ErrorPanel, Spinner, TextField } from '../../components/ui';
import { api, ApiError, errorMessage, invalidate, useApi } from '../../lib/api';
import { percent, round2, sar } from '../../lib/format';
import type { Product, Settings } from '../../lib/types';
import { schemas, validate, type FieldErrors } from '../../lib/validation';
import { TabIntro, useAction } from './shared';
import { t } from '../../lib/i18n';

function ProductVatRow({ product, defaultVat }: { product: Product; defaultVat: number }) {
  const [price, setPrice] = useState(String(product.unit_price));
  const [vat, setVat] = useState(
    product.vat_rate_override == null ? '' : String(product.vat_rate_override),
  );
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setPrice(String(product.unit_price));
    setVat(product.vat_rate_override == null ? '' : String(product.vat_rate_override));
  }, [product.unit_price, product.vat_rate_override]);

  const numericPrice = Number(price) || 0;
  const rate = vat.trim() === '' ? defaultVat : Number(vat) || 0;
  const vatValue = round2((numericPrice * rate) / 100);
  const dirty =
    numericPrice !== product.unit_price ||
    (vat.trim() === '' ? null : Number(vat)) !== product.vat_rate_override;

  const save = async () => {
    const result = validate(schemas.productPricing, { id: product.id, unit_price: price, vat_rate: vat });
    if (!result.ok) {
      setState({ tone: 'error', text: result.errors.unit_price || result.errors.vat_rate || t("Check the values.") });
      return;
    }
    setSaving(true);
    setState(null);
    try {
      await api('/api/products', { method: 'PUT', body: { ...result.data, mode: 'pricing' } });
      invalidate('/api/products');
      setState({ tone: 'ok', text: t("Saved") });
    } catch (err) {
      setState({ tone: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td>
        <p className="font-semibold">{t(product.name)}</p>
        <p className="text-xs text-muted">
          {product.sku}{' '}{t("· MOQ")}{' '}{product.moq}
        </p>
      </td>
      <td>
        <label className="sr-only" htmlFor={`vat-price-${product.id}`}>
          {t("Unit price excluding VAT for")}{' '}{t(product.name)}
        </label>
        <input
          id={`vat-price-${product.id}`}
          className="field-input field-sm w-28 tabular-nums"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, '').slice(0, 10))}
        />
      </td>
      <td>
        <label className="sr-only" htmlFor={`vat-rate-${product.id}`}>
          {t("VAT percentage for")}{' '}{t(product.name)}
        </label>
        <input
          id={`vat-rate-${product.id}`}
          className="field-input field-sm w-24 tabular-nums"
          inputMode="decimal"
          placeholder={t("{0} (default)", [defaultVat])}
          value={vat}
          onChange={(e) => setVat(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
        />
      </td>
      <td className="num">{sar(vatValue)}</td>
      <td className="num font-semibold">{sar(round2(numericPrice + vatValue))}</td>
      <td>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? <Spinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {t("Save")}
          </button>
          {state && (
            <span
              role="status"
              className={`text-xs font-semibold ${state.tone === 'ok' ? 'text-primary-strong' : 'text-danger'}`}
            >
              {state.text}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function SettingsTab() {
  const products = useApi<Product[]>('/api/products');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [general, setGeneral] = useState({ vat_rate: '15', default_commission_rate: '2', seller_vat_number: '' });
  const [generalErrors, setGeneralErrors] = useState<FieldErrors>({});
  const [generalSaved, setGeneralSaved] = useState(false);
  const [tier, setTier] = useState({ label: '', min_moq: '', rate: '' });
  const [tierErrors, setTierErrors] = useState<FieldErrors>({});

  const load = useCallback(async () => {
    try {
      const data = await api<Settings>('/api/operations?resource=settings');
      setSettings(data);
      setGeneral({
        vat_rate: String(data.vat_rate),
        default_commission_rate: String(data.default_commission_rate),
        seller_vat_number: data.seller_vat_number ?? '',
      });
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const action = useAction(load);

  const saveGeneral = async (event: FormEvent) => {
    event.preventDefault();
    setGeneralSaved(false);
    const result = validate(schemas.settings, general);
    if (!result.ok || general.vat_rate.trim() === '' || general.default_commission_rate.trim() === '') {
      setGeneralErrors({
        ...(result.ok ? {} : result.errors),
        ...(general.vat_rate.trim() === '' ? { vat_rate: t("Enter the default VAT percentage.") } : {}),
        ...(general.default_commission_rate.trim() === ''
          ? { default_commission_rate: t("Enter the default commission rate.") }
          : {}),
      });
      return;
    }
    setGeneralErrors({});
    const ok = await action.run('general', async () => {
      try {
        await api('/api/operations?resource=settings', { method: 'PUT', body: result.data });
      } catch (err) {
        if (err instanceof ApiError) setGeneralErrors(err.fields);
        throw err;
      }
    });
    if (ok) {
      setGeneralSaved(true);
      invalidate('/api/products'); // the default VAT changes every product without its own rate
    }
  };

  const addTier = async (event: FormEvent) => {
    event.preventDefault();
    const result = validate(schemas.tier, tier);
    if (!result.ok || tier.rate.trim() === '' || tier.min_moq.trim() === '') {
      setTierErrors({
        ...(result.ok ? {} : result.errors),
        ...(tier.min_moq.trim() === '' ? { min_moq: t("Enter the MOQ threshold.") } : {}),
        ...(tier.rate.trim() === '' ? { rate: t("Enter the commission rate.") } : {}),
      });
      return;
    }
    setTierErrors({});
    const ok = await action.run('tier', async () => {
      try {
        await api('/api/operations?resource=tiers', { method: 'POST', body: result.data });
      } catch (err) {
        if (err instanceof ApiError) setTierErrors(err.fields);
        throw err;
      }
    });
    if (ok) setTier({ label: '', min_moq: '', rate: '' });
  };

  const removeTier = (id: number) =>
    action.run(`tier-${id}`, () =>
      api('/api/operations?resource=tiers', { method: 'DELETE', body: { id } }),
    );

  if (error) return <ErrorPanel message={error} onRetry={() => void load()} />;
  if (loading || !settings) {
    return (
      <div className="space-y-4" role="status">
        <p className="sr-only">{t("Loading settings")}</p>
        <div className="skeleton h-9 w-56" />
        <div className="skeleton h-56 rounded-2xl" />
        <div className="skeleton h-72 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <TabIntro title={t("Settings")}>
          {t("Administrator-only configuration for VAT and staff commissions. Changes apply to new orders and new commission records; existing bills keep the values they were issued with.")}
        </TabIntro>
        <p className="inline-flex items-center gap-2 rounded-full bg-forest px-3.5 py-1.5 text-xs font-semibold text-brass-soft">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t("Only the admin role can open this tab")}
        </p>
      </div>

      {action.error && <Alert>{action.error}</Alert>}

      <form onSubmit={saveGeneral} noValidate className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <h3 className="text-2xl">
          {t("VAT and defaults")}{' '}
          <span lang="ar" dir="rtl" className="font-arabic text-lg text-muted rtl:hidden">
            ضريبة القيمة المضافة
          </span>
        </h3>
        <p className="mt-1 text-sm text-muted">
          {t("The default VAT applies to every product that does not have its own rate in the table below.")}
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <TextField
            id="set-vat"
            label={t("Default VAT (%)")}
            required
            inputMode="decimal"
            value={general.vat_rate}
            onChange={(e) => setGeneral((g) => ({ ...g, vat_rate: e.target.value }))}
            error={generalErrors.vat_rate}
            hint={t("The standard rate in Saudi Arabia is 15%.")}
          />
          <TextField
            id="set-commission"
            label={t("Default commission rate (%)")}
            required
            inputMode="decimal"
            value={general.default_commission_rate}
            onChange={(e) => setGeneral((g) => ({ ...g, default_commission_rate: e.target.value }))}
            error={generalErrors.default_commission_rate}
            hint={t("Used when a product’s MOQ is below every tier.")}
          />
          <TextField
            id="set-vat-number"
            label={t("Company VAT registration no.")}
            inputMode="numeric"
            maxLength={15}
            placeholder={t("15 digits")}
            value={general.seller_vat_number}
            onChange={(e) =>
              setGeneral((g) => ({ ...g, seller_vat_number: e.target.value.replace(/\D/g, '') }))
            }
            error={generalErrors.seller_vat_number}
            hint={t("Printed on order bills and receipts.")}
          />
        </div>
        {generalSaved && (
          <Alert tone="success" className="mt-5">
            {t("Settings saved.")}
          </Alert>
        )}
        <button type="submit" className="btn btn-primary mt-5" disabled={action.busy !== null}>
          {action.busy === 'general' ? <Spinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
          {t("Save settings")}
        </button>
      </form>

      <div>
        <h3 className="text-2xl">{t("VAT per product")}</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          {t("Set the unit price (excluding VAT) and, if needed, a VAT percentage for an individual product. Leave the VAT field empty to use the default of")}{' '}{percent(settings.vat_rate)}{t(". The VAT value per item and the price including VAT are shown on every order bill and receipt.")}
        </p>
        <div className="mt-4">
          {products.error ? (
            <ErrorPanel message={products.error} onRetry={products.reload} />
          ) : products.loading ? (
            <div className="skeleton h-64 rounded-2xl" role="status" aria-label={t("Loading products")} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-card">
              <table className="data-table min-w-[820px]">
                <thead>
                  <tr>
                    <th scope="col">{t("Item and SKU")}</th>
                    <th scope="col">{t("Unit price excl. VAT (SAR)")}</th>
                    <th scope="col">{t("VAT %")}</th>
                    <th scope="col" className="num">
                      {t("VAT value / item")}
                    </th>
                    <th scope="col" className="num">
                      {t("Price incl. VAT")}
                    </th>
                    <th scope="col">{t("Save")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(products.data ?? []).map((product) => (
                    <ProductVatRow key={product.id} product={product} defaultVat={settings.vat_rate} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form
          onSubmit={addTier}
          noValidate
          className="rounded-2xl border border-line bg-card p-5 sm:p-6 lg:self-start"
        >
          <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-primary-strong">
            <Percent className="h-6 w-6" aria-hidden="true" />
          </span>
          <h3 className="mt-4 text-2xl">{t("Add a commission tier")}</h3>
          <p className="mt-1 text-sm text-muted">
            {t("A tier sets the commission rate for products whose minimum order quantity (MOQ) is at or above its threshold.")}
          </p>
          <div className="mt-5 space-y-4">
            <TextField
              id="tier-label"
              label={t("Tier label")}
              required
              placeholder={t("e.g. Bulk MOQ")}
              maxLength={80}
              value={tier.label}
              onChange={(e) => setTier((t) => ({ ...t, label: e.target.value }))}
              error={tierErrors.label}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="tier-moq"
                label={t("MOQ threshold")}
                required
                inputMode="numeric"
                placeholder="e.g. 5"
                value={tier.min_moq}
                onChange={(e) => setTier((t) => ({ ...t, min_moq: e.target.value.replace(/\D/g, '') }))}
                error={tierErrors.min_moq}
              />
              <TextField
                id="tier-rate"
                label={t("Commission rate (%)")}
                required
                inputMode="decimal"
                placeholder="e.g. 3.5"
                value={tier.rate}
                onChange={(e) => setTier((t) => ({ ...t, rate: e.target.value }))}
                error={tierErrors.rate}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-5" disabled={action.busy !== null}>
            {action.busy === 'tier' ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {t("Add tier")}
          </button>
        </form>

        <div>
          <h3 className="text-2xl">{t("Active commission tiers")}</h3>
          <p className="mt-1 text-sm text-muted">
            {t("When a delivery is completed, each order line earns the rate of the highest tier its product’s MOQ reaches. Lines below every tier earn the default rate of")}{' '}
            {percent(settings.default_commission_rate)}.
          </p>
          {settings.tiers.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-line bg-card p-6 text-muted">
              {t("No tiers yet. Every delivered order earns the default rate.")}
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {settings.tiers.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-semibold">{t(row.label)}</p>
                    <p className="text-sm text-muted">{t("Applies when product MOQ ≥")}{' '}{row.min_moq}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-2xl text-primary-strong">{percent(row.rate)}</span>
                    <button
                      type="button"
                      onClick={() => void removeTier(row.id)}
                      disabled={action.busy !== null}
                      aria-label={t("Delete tier {0}", [row.label])}
                      className="grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    >
                      {action.busy === `tier-${row.id}` ? (
                        <Spinner />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
