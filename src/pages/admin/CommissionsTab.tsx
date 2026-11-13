import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgePercent, Check, HandCoins, Settings as SettingsIcon, X } from 'lucide-react';
import ResponsiveTable from '../../components/ResponsiveTable';
import { Alert, Badge, ErrorPanel, Spinner } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import {
  COMMISSION_STATUS_LABEL,
  COMMISSION_STATUS_TONE,
  formatDateTime,
  percent,
  round2,
  sar,
} from '../../lib/format';
import type { Commission } from '../../lib/types';
import { EmptyState, Stat, TabIntro, useAction, type OpsProps } from './shared';
import { t } from '../../lib/i18n';

export default function CommissionsTab({ isAdmin, orders }: OpsProps) {
  const [rows, setRows] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<number>>(() => new Set());

  const load = useCallback(async () => {
    try {
      setRows(await api<Commission[]>('/api/operations?resource=commissions'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Commissions are created when a delivery completes, so refresh with the orders.
  const deliveredCount = orders.filter((o) => o.delivery?.status === 'delivered').length;
  useEffect(() => {
    void load();
  }, [load, deliveredCount]);

  const action = useAction(load);
  const act = (row: Commission, name: 'pay' | 'confirm' | 'reject') =>
    action.run(`${name}-${row.id}`, () =>
      api('/api/operations?resource=commissions', {
        method: 'PUT',
        body: { id: row.id, action: name },
      }),
    );

  const toggle = (id: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = round2(rows.reduce((sum, r) => sum + Number(r.amount), 0));
  const paid = round2(rows.filter((r) => r.status === 'paid').reduce((sum, r) => sum + Number(r.amount), 0));
  const awaiting = rows.filter((r) => r.status === 'awaiting_confirmation').length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <TabIntro title={t("Commissions")}>
          {isAdmin
            ? t("A commission is created automatically for the delivering staff member when an order is delivered, using the MOQ rate tiers from Settings. After you press “Pay commission”, it stays not paid until the staff member confirms they received it.")
            : t("Your commissions for completed deliveries, calculated from the MOQ rate tiers. When the administrator pays one, confirm that you received it. Until you confirm, it counts as not paid.")}
        </TabIntro>
        {isAdmin && (
          <Link to="/admin/settings" className="btn btn-outline btn-sm">
            <SettingsIcon className="h-4 w-4" aria-hidden="true" />
            {t("Commission rates")}
          </Link>
        )}
      </div>

      {error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : loading ? (
        <div className="space-y-3" role="status">
          <p className="sr-only">{t("Loading commissions")}</p>
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-56 rounded-2xl" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={BadgePercent} title={t("No commissions yet")}>
          {t("A commission record is created as soon as a delivery is confirmed as received.")}
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label={isAdmin ? t("Total commissions") : t("Total earned")} value={sar(total)} hint={t("{0} records", [rows.length])} />
            <Stat label={t("Paid and confirmed")} value={sar(paid)} />
            <Stat
              label={t("Not paid")}
              value={sar(round2(total - paid))}
              hint={awaiting > 0 ? t("{0} awaiting staff confirmation", [awaiting]) : undefined}
            />
          </div>

          {action.error && <Alert className="mb-5">{action.error}</Alert>}

          <ResponsiveTable
            rows={rows}
            getRowKey={(row) => row.id}
            minWidth={900}
            isExpanded={(row) => open.has(row.id)}
            onToggle={(row) => toggle(row.id)}
            expandAria={(row, expanded) =>
              t("{0} calculation for {1}", [expanded ? t("Hide") : t("Show"), row.order_reference])
            }
            expandedContent={(row) => (
              <ResponsiveTable
                nested
                rows={row.breakdown}
                getRowKey={(line) => line.sku}
                minWidth={620}
                columns={[
                  {
                    label: t("Item"),
                    primary: true,
                    render: (line) => (
                      <>
                        <span className="font-semibold">{t(line.product_name)}</span>{' '}
                        <span className="text-xs text-muted">{line.sku}</span>
                      </>
                    ),
                  },
                  { label: t("Product MOQ"), num: true, render: (line) => line.moq },
                  { label: t("Tier applied"), render: (line) => t(line.tier_label) },
                  { label: t("Line value (excl. VAT)"), num: true, render: (line) => sar(line.base) },
                  { label: t("Rate"), num: true, render: (line) => percent(line.rate) },
                  {
                    label: t("Commission"),
                    num: true,
                    render: (line) => <span className="font-semibold">{sar(line.amount)}</span>,
                  },
                ]}
              />
            )}
            columns={[
              {
                label: t("Order"),
                primary: true,
                render: (row) => (
                  <>
                    <p className="font-display text-lg tracking-wide">{row.order_reference}</p>
                    <p className="text-xs text-muted">{formatDateTime(row.created_at)}</p>
                  </>
                ),
              },
              {
                label: t("Staff member"),
                primary: true,
                render: (row) => (
                  <>
                    <p className="font-semibold">{row.staff_name}</p>
                    <p className="text-xs text-muted">{row.staff_email}</p>
                  </>
                ),
              },
              {
                label: t("MOQ tier"),
                render: (row) => (
                  <>
                    <p>{t(row.tier_label)}</p>
                    <p className="text-xs text-muted">{t("Highest MOQ")}{' '}{row.moq_basis}</p>
                  </>
                ),
              },
              { label: t("Order value (excl. VAT)"), num: true, render: (row) => sar(row.order_value) },
              { label: t("Rate"), num: true, render: (row) => percent(row.rate) },
              {
                label: t("Commission"),
                num: true,
                render: (row) => (
                  <span className="font-bold text-primary-strong">{sar(row.amount)}</span>
                ),
              },
              {
                label: t("Payment status"),
                render: (row) => (
                  <>
                    <Badge tone={COMMISSION_STATUS_TONE[row.status]}>
                      {t(COMMISSION_STATUS_LABEL[row.status])}
                    </Badge>
                    {row.status === 'paid' && (
                      <p className="mt-1 text-xs text-muted">{formatDateTime(row.confirmed_at)}</p>
                    )}
                  </>
                ),
              },
            ]}
            actions={(row) => (
              <>
                {isAdmin && row.status === 'unpaid' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={action.busy !== null}
                    onClick={() => void act(row, 'pay')}
                  >
                    {action.busy === `pay-${row.id}` ? (
                      <Spinner />
                    ) : (
                      <HandCoins className="h-4 w-4" aria-hidden="true" />
                    )}
                    {t("Pay commission")}
                  </button>
                )}
                {isAdmin && row.status === 'awaiting_confirmation' && (
                  <p className="text-sm text-muted">
                    {t("Marked paid")}{' '}{formatDateTime(row.paid_marked_at)}.
                    <br />
                    {t("Waiting for")}{' '}{row.staff_name.split(' ')[0]}.
                  </p>
                )}
                {!isAdmin && row.status === 'awaiting_confirmation' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={action.busy !== null}
                      onClick={() => void act(row, 'confirm')}
                    >
                      {action.busy === `confirm-${row.id}` ? (
                        <Spinner />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      )}
                      {t("Confirm received")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={action.busy !== null}
                      onClick={() => void act(row, 'reject')}
                    >
                      {action.busy === `reject-${row.id}` ? (
                        <Spinner />
                      ) : (
                        <X className="h-4 w-4" aria-hidden="true" />
                      )}
                      {t("Not received")}
                    </button>
                  </div>
                )}
                {!isAdmin && row.status === 'unpaid' && (
                  <p className="text-sm text-muted">{t("Awaiting payment by admin.")}</p>
                )}
                {row.status === 'paid' && (
                  <p className="inline-flex items-center gap-1 text-sm font-semibold text-primary-strong">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {t("Settled")}
                  </p>
                )}
              </>
            )}
          />
        </>
      )}
    </div>
  );
}
