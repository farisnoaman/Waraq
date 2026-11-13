import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Tags, Pencil, Plus, Trash2, Power, CalendarClock, X } from 'lucide-react';
import ResponsiveTable, { type ResponsiveColumn } from '../../components/ResponsiveTable';
import { Alert, Badge, ErrorPanel, SelectField, Spinner, TextAreaField, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, sar } from '../../lib/format';
import type { Promotion, PromotionStatus } from '../../lib/types';
import { schemas, validate } from '../../lib/validation';
import { EmptyState, TabIntro, useAction, type OpsProps } from './shared';
import { t } from '../../lib/i18n';

/**
 * Admin promotions: % or fixed-amount discounts unlocked by an order
 * threshold, with a schedule. Active promotions (running or scheduled) live
 * in the first tab; deactivated and expired ones move to the Inactive tab and
 * return when reactivated (optionally with a new expiry).
 */

type TabKey = 'active' | 'inactive';

interface FormState {
  name: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: string;
  threshold_type: 'order_total' | 'total_units' | 'total_cartons';
  threshold_value: string;
  starts_at: string;
  expires_at: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  threshold_type: 'order_total',
  threshold_value: '',
  starts_at: '',
  expires_at: '',
};

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO string -> the local value a `datetime-local` input expects. */
const toInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const STATUS_TONE: Record<PromotionStatus, 'mint' | 'brass' | 'danger' | 'neutral'> = {
  running: 'mint',
  scheduled: 'brass',
  expired: 'danger',
  inactive: 'neutral',
};

const STATUS_LABEL: Record<PromotionStatus, string> = {
  running: 'Running',
  scheduled: 'Scheduled',
  expired: 'Expired',
  inactive: 'Deactivated',
};

type FormStateErrors = Partial<Record<keyof FormState, string>>;

export default function PromotionsTab(_props: OpsProps) {
  const [rows, setRows] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('active');
  const [form, setForm] = useState<(FormState & { id: number | null }) | null>(null);
  const [errors, setErrors] = useState<FormStateErrors>({});
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<Promotion[]>('/api/promotions'));
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const action = useAction(load);

  useEffect(() => {
    void load();
  }, [load]);

  const set =
    (key: keyof FormState) =>
    (event: { target: { value: string } }) => {
      const value = event.target.value;
      setForm((current) => (current ? { ...current, [key]: value } : current));
      setErrors((current) => ({ ...current, [key]: '' }));
    };

  const openCreate = () => {
    setNotice(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
  };

  const openEdit = (promo: Promotion) => {
    setNotice(null);
    setForm({
      id: promo.id,
      name: promo.name,
      description: promo.description ?? '',
      discount_type: promo.discount_type,
      discount_value: String(promo.discount_value),
      threshold_type: promo.threshold_type,
      threshold_value: String(promo.threshold_value),
      starts_at: toInput(promo.starts_at),
      expires_at: toInput(promo.expires_at),
    });
    setErrors({});
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    const result = validate(schemas.promotion, form);
    if (!result.ok) {
      setErrors(result.errors as FormStateErrors);
      return;
    }
    const ok = await action.run('save', async () => {
      try {
        if (form.id) {
          await api('/api/promotions', { method: 'PUT', body: { ...result.data, id: form.id } });
          setNotice(t("Promotion updated."));
        } else {
          await api('/api/promotions', { method: 'POST', body: result.data });
          setNotice(t("Promotion created."));
        }
        setForm(null);
      } catch (err) {
        if (typeof err === 'object' && err !== null && 'fields' in err) {
          setErrors((err as { fields: FormStateErrors }).fields);
        }
        throw err;
      }
    });
    if (!ok) return;
  };

  const setStatus = async (promo: Promotion, next: 'activate' | 'deactivate') => {
    setNotice(null);
    const body: Record<string, unknown> = { id: promo.id, action: next };
    // A lapsed promotion needs a fresh expiry to run again: extend it by 30
    // days from now. A merely-deactivated one keeps its window.
    if (next === 'activate' && new Date(promo.expires_at).getTime() < Date.now()) {
      body.expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }
    await action.run(`${next}-${promo.id}`, () =>
      api('/api/promotions', { method: 'PUT', body }),
    );
  };

  const remove = async (promo: Promotion) => {
    if (!window.confirm(t("Delete “{0}”? This cannot be undone.", [promo.name]))) return;
    setNotice(null);
    await action.run(`delete-${promo.id}`, () =>
      api('/api/promotions', { method: 'DELETE', body: { id: promo.id } }),
    );
    setForm(null);
  };

  const activeRows = useMemo(
    () => rows.filter((row) => row.is_active && row.status !== 'expired'),
    [rows],
  );
  const inactiveRows = useMemo(
    () => rows.filter((row) => !row.is_active || row.status === 'expired'),
    [rows],
  );
  const visible = tab === 'active' ? activeRows : inactiveRows;

  const discountLabel = (promo: Promotion) =>
    promo.discount_type === 'percentage'
      ? `${promo.discount_value}%`
      : sar(promo.discount_value);

  const thresholdLabel = (promo: Promotion) => {
    if (promo.threshold_type === 'order_total') {
      return t("Order total ≥ {0}", [sar(promo.threshold_value)]);
    }
    if (promo.threshold_type === 'total_units') {
      return t("Total units ≥ {0}", [promo.threshold_value]);
    }
    return t("Total cartons ≥ {0}", [promo.threshold_value]);
  };

  const columns: ResponsiveColumn<Promotion>[] = [
    {
      label: t("Name"),
      primary: true,
      render: (promo) => (
        <>
          <p className="font-semibold">{t(promo.name)}</p>
          {promo.description && <p className="text-xs text-muted">{t(promo.description)}</p>}
        </>
      ),
    },
    {
      label: t("Discount"),
      num: true,
      render: (promo) => (
        <span className="font-semibold text-primary-strong">
          {promo.discount_type === 'percentage'
            ? `${promo.discount_value}%`
            : `−${sar(promo.discount_value)}`}
        </span>
      ),
    },
    { label: t("Threshold"), render: (promo) => thresholdLabel(promo) },
    {
      label: t("Schedule"),
      render: (promo) => (
        <>
          <p className="text-xs text-muted">
            {t("From")}{' '}{formatDateTime(promo.starts_at)}
          </p>
          <p className="text-xs text-muted">
            {t("Until")}{' '}{formatDateTime(promo.expires_at)}
          </p>
        </>
      ),
    },
    {
      label: t("Status"),
      render: (promo) => (
        <>
          <Badge tone={STATUS_TONE[promo.status]}>{t(STATUS_LABEL[promo.status])}</Badge>
          {!promo.is_active && promo.status !== 'expired' && (
            <p className="mt-1 text-xs text-muted">{t("Deactivated by the administrator.")}</p>
          )}
        </>
      ),
    },
  ];

  const actions = (promo: Promotion) => (
    <>
      <button type="button" className="btn btn-outline btn-sm" onClick={() => openEdit(promo)}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
        {t("Edit")}
      </button>
      {promo.is_active && promo.status !== 'expired' ? (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={action.busy !== null}
          onClick={() => void setStatus(promo, 'deactivate')}
        >
          <Power className="h-4 w-4" aria-hidden="true" />
          {t("Deactivate")}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={action.busy !== null}
          onClick={() => void setStatus(promo, 'activate')}
        >
          {action.busy === `activate-${promo.id}` ? (
            <Spinner />
          ) : (
            <Power className="h-4 w-4" aria-hidden="true" />
          )}
          {promo.status === 'expired' ? t("Reactivate") : t("Activate")}
        </button>
      )}
      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={action.busy !== null}
        onClick={() => void remove(promo)}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {t("Delete")}
      </button>
    </>
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <TabIntro title={t("Promotions")}>
          {t("Discounts applied automatically at order time: percentage or fixed amount, unlocked when the order reaches a threshold. Active promotions run on their schedule; deactivated and expired ones wait in the second tab until you reactivate them.")}
        </TabIntro>
        <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("New promotion")}
        </button>
      </div>

      {notice && (
        <Alert tone="success" className="mt-5">
          {notice}
        </Alert>
      )}
      {action.error && <Alert className="mt-5">{action.error}</Alert>}

      {/* Inline create/edit form */}
      {form && (
        <form
          onSubmit={save}
          noValidate
          className="fade-up mt-6 rounded-2xl border border-primary/30 bg-card p-5 sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-2xl">{form.id ? t("Edit promotion") : t("New promotion")}</h3>
            <button
              type="button"
              onClick={() => setForm(null)}
              aria-label={t("Close form")}
              className="grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-paper-deep hover:text-ink"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <TextField
                id="promo-name"
                label={t("Name")}
                required
                maxLength={120}
                value={form.name}
                onChange={set('name')}
                error={errors.name}
              />
            </div>
            <div className="sm:col-span-2">
              <TextAreaField
                id="promo-description"
                label={t("Description")}
                rows={2}
                maxLength={300}
                value={form.description}
                onChange={set('description')}
                error={errors.description}
              />
            </div>
            <SelectField
              id="promo-discount-type"
              label={t("Discount type")}
              required
              value={form.discount_type}
              onChange={set('discount_type')}
              error={errors.discount_type}
            >
              <option value="percentage">{t("Percentage of the order")}</option>
              <option value="fixed">{t("Fixed amount")}</option>
            </SelectField>
            <TextField
              id="promo-discount-value"
              label={form.discount_type === 'percentage' ? t("Discount (%)") : t("Discount amount (SAR)")}
              required
              inputMode="decimal"
              value={form.discount_value}
              onChange={set('discount_value')}
              error={errors.discount_value}
            />
            <SelectField
              id="promo-threshold-type"
              label={t("Threshold based on")}
              required
              value={form.threshold_type}
              onChange={set('threshold_type')}
              error={errors.threshold_type}
            >
              <option value="order_total">{t("Order total (SAR)")}</option>
              <option value="total_units">{t("Total units in the order")}</option>
              <option value="total_cartons">{t("Total cartons in the order")}</option>
            </SelectField>
            <TextField
              id="promo-threshold-value"
              label={t("Threshold value")}
              required
              inputMode="decimal"
              value={form.threshold_value}
              onChange={set('threshold_value')}
              error={errors.threshold_value}
              hint={t("The discount applies when the order reaches this.")}
            />
            <TextField
              id="promo-starts"
              label={t("Starts at")}
              required
              type="datetime-local"
              value={form.starts_at}
              onChange={set('starts_at')}
              error={errors.starts_at}
            />
            <TextField
              id="promo-expires"
              label={t("Expires at")}
              required
              type="datetime-local"
              value={form.expires_at}
              onChange={set('expires_at')}
              error={errors.expires_at}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <button type="submit" className="btn btn-primary" disabled={action.busy !== null}>
              {action.busy === 'save' && <Spinner />}
              {form.id ? t("Save changes") : t("Create promotion")}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)}>
              {t("Cancel")}
            </button>
          </div>
        </form>
      )}

      {/* Active / inactive tabs */}
      <div className="mt-6 flex gap-2">
        {(['active', 'inactive'] as TabKey[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors ${
              tab === key ? 'bg-primary text-white' : 'bg-paper-deep text-ink hover:bg-line'
            }`}
          >
            {key === 'active' ? t("Active") : t("Inactive")}
            <span className="tabular-nums">
              {(key === 'active' ? activeRows : inactiveRows).length}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4">
        {loadError ? (
          <ErrorPanel message={loadError} onRetry={() => void load()} />
        ) : loading ? (
          <div className="space-y-3" role="status">
            <p className="sr-only">{t("Loading promotions")}</p>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-24 rounded-2xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={tab === 'active' ? CalendarClock : Tags}
            title={tab === 'active' ? t("No active promotions") : t("No inactive promotions")}
          >
            {tab === 'active'
              ? t("Create a promotion and it runs on its schedule, appearing on eligible orders automatically.")
              : t("Deactivated and expired promotions wait here until you reactivate or delete them.")}
          </EmptyState>
        ) : (
          <ResponsiveTable
            rows={visible}
            getRowKey={(promo) => promo.id}
            columns={columns}
            actions={actions}
          />
        )}
      </div>
    </div>
  );
}
