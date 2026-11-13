import { useState, type FormEvent } from 'react';
import { Banknote, Printer, Wallet } from 'lucide-react';
import DocumentModal from '../../components/DocumentModal';
import ResponsiveTable from '../../components/ResponsiveTable';
import { Alert, Badge, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import {
  formatDateTime,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_TONE,
  round2,
  sar,
} from '../../lib/format';
import type { Installment, Order, Payment, PaymentMethod } from '../../lib/types';
import { schemas, validate, type FieldErrors } from '../../lib/validation';
import { EmptyState, Stat, TabIntro, useAction, type OpsProps } from './shared';
import { t } from '../../lib/i18n';

/** Quick-select suggestions for a partial payment, as a share of the total due. */
const SUGGESTIONS = [10, 20, 25, 30, 40, 50, 60, 70, 80];
const METHODS: PaymentMethod[] = ['bank_transfer', 'mada', 'cash', 'cheque'];

type PaidOrder = Order & { payment: Payment };

function InstallmentForm({
  order,
  remaining,
  reload,
}: {
  order: PaidOrder;
  remaining: number;
  reload: () => Promise<void>;
}) {
  const action = useAction(reload);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const totalDue = Number(order.payment.total_due);
  const id = `pay-${order.payment.id}`;

  const pick = (label: string, value: number) => {
    setPicked(label);
    setAmount(String(round2(Math.min(remaining, value))));
    setErrors({});
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validate(schemas.installment, {
      payment_id: order.payment.id,
      amount,
      method,
      receiver_reference: reference,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (Number(result.data.amount) > remaining) {
      setErrors({ amount: t("This is more than the remaining balance of {0}.", [sar(remaining)]) });
      return;
    }
    setErrors({});
    const ok = await action.run('record', async () => {
      try {
        await api('/api/operations?resource=payments', { method: 'POST', body: result.data });
      } catch (err) {
        if (err instanceof ApiError) setErrors(err.fields);
        throw err;
      }
    });
    if (ok) {
      setAmount('');
      setReference('');
      setPicked(null);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="rounded-xl border border-line bg-white p-4">
      <p className="text-sm font-semibold">{t("Record a payment")}</p>
      <div className="mt-3" role="group" aria-label={t("Partial payment suggestions")}>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">
          {t("Quick select (share of total due)")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((pct) => {
            const label = `${pct}%`;
            return (
              <button
                key={pct}
                type="button"
                aria-pressed={picked === label}
                onClick={() => pick(label, (totalDue * pct) / 100)}
                className={`min-h-9 rounded-full px-3 text-sm font-semibold tabular-nums transition-colors ${
                  picked === label ? 'bg-primary text-white' : 'bg-paper-deep text-ink hover:bg-line'
                }`}
              >
                {label}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={picked === 'Full'}
            onClick={() => pick('Full', remaining)}
            className={`min-h-9 rounded-full px-3.5 text-sm font-semibold transition-colors ${
              picked === 'Full' ? 'bg-primary text-white' : 'bg-forest text-paper hover:bg-forest-soft'
            }`}
          >
            {t("Full balance")}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-amount`} className="mb-1.5 block text-sm font-semibold">
            {t("Amount received (SAR)")}
          </label>
          <input
            id={`${id}-amount`}
            className="field-input field-sm tabular-nums"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            aria-invalid={errors.amount ? true : undefined}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.]/g, '').slice(0, 12));
              setPicked(null);
              setErrors({});
            }}
          />
          <p className={`mt-1.5 text-sm ${errors.amount ? 'font-medium text-danger' : 'text-muted'}`}>
            {errors.amount ?? t("Remaining balance {0}", [sar(remaining)])}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-method`} className="mb-1.5 block text-sm font-semibold">
            {t("Payment method")}
          </label>
          <select
            id={`${id}-method`}
            className="field-input field-sm"
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {t(PAYMENT_METHOD_LABEL[m])}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-ref`} className="mb-1.5 block text-sm font-semibold">
            {t("Receiver reference")}
          </label>
          <input
            id={`${id}-ref`}
            className="field-input field-sm"
            placeholder={t("Transfer no. or cheque no.")}
            maxLength={120}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          {errors.receiver_reference && (
            <p className="mt-1.5 text-sm font-medium text-danger">{errors.receiver_reference}</p>
          )}
        </div>
      </div>

      {action.error && <Alert className="mt-4">{action.error}</Alert>}

      <button type="submit" className="btn btn-primary btn-sm mt-4" disabled={action.busy !== null}>
        {action.busy ? <Spinner /> : <Banknote className="h-4 w-4" aria-hidden="true" />}
        {t("Record payment and issue receipt")}
      </button>
    </form>
  );
}

export default function PaymentsTab({ orders, sellerVat, isAdmin, reload }: OpsProps) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const [receipt, setReceipt] = useState<{ order: Order; installment: Installment } | null>(null);

  const rows = orders.filter((order): order is PaidOrder => order.payment !== null);
  const totals = rows.reduce(
    (sum, order) => ({
      due: sum.due + Number(order.payment.total_due),
      paid: sum.paid + Number(order.payment.total_paid),
    }),
    { due: 0, paid: 0 },
  );

  const toggle = (id: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      <TabIntro title={t("Payments")}>
        {t("A payment record is created automatically when a delivery is completed. Open a row to see its installments, record a partial or full payment, and print a receipt for the buyer.")}
        {!isAdmin && " " + t("You only see payments for deliveries assigned to you.")}
      </TabIntro>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title={t("No payment records yet")}>
          {t("They appear here as soon as a delivery is confirmed as received.")}
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label={t("Total due")} value={sar(totals.due)} hint={t("{0} payment records", [rows.length])} />
            <Stat label={t("Received")} value={sar(totals.paid)} />
            <Stat label={t("Outstanding")} value={sar(round2(totals.due - totals.paid))} />
          </div>

          <ResponsiveTable
            rows={rows}
            getRowKey={(order) => order.payment.id}
            minWidth={820}
            isExpanded={(order) => open.has(order.payment.id)}
            onToggle={(order) => toggle(order.payment.id)}
            expandAria={(order, expanded) =>
              t("{0} installments for {1}", [expanded ? t("Hide") : t("Show"), order.reference])
            }
            expandedContent={(order) => {
              const remaining = round2(Number(order.payment.total_due) - Number(order.payment.total_paid));
              return (
                <div className="space-y-4">
                  {order.payment.installments.length === 0 ? (
                    <p className="text-sm text-muted">
                      {t("No installments recorded yet for this payment.")}
                    </p>
                  ) : (
                    <ResponsiveTable
                      nested
                      rows={order.payment.installments}
                      getRowKey={(installment) => installment.id}
                      minWidth={720}
                      columns={[
                        {
                          label: t("Receipt no."),
                          primary: true,
                          render: (installment) => (
                            <span className="font-semibold">{installment.receipt_number}</span>
                          ),
                        },
                        {
                          label: t("Received on"),
                          render: (installment) => formatDateTime(installment.created_at),
                        },
                        { label: t("Received by"), render: (installment) => installment.receiver_name },
                        {
                          label: t("Method · reference"),
                          render: (installment) => (
                            <>
                              {t(PAYMENT_METHOD_LABEL[installment.method])}
                              {installment.receiver_reference
                                ? ` · ${installment.receiver_reference}`
                                : ''}
                            </>
                          ),
                        },
                        {
                          label: t("Amount"),
                          num: true,
                          render: (installment) => (
                            <span className="font-semibold">{sar(installment.amount)}</span>
                          ),
                        },
                        {
                          label: t("Balance after"),
                          num: true,
                          render: (installment) => sar(installment.balance_after),
                        },
                      ]}
                      actions={(installment) => (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setReceipt({ order, installment })}
                        >
                          <Printer className="h-4 w-4" aria-hidden="true" />
                          {t("Print receipt")}
                        </button>
                      )}
                    />
                  )}
                  {remaining > 0 ? (
                    <InstallmentForm order={order} remaining={remaining} reload={reload} />
                  ) : (
                    <Alert tone="success">
                      {t("This order is paid in full and has been marked completed.")}
                    </Alert>
                  )}
                </div>
              );
            }}
            columns={[
              {
                label: t("Order"),
                primary: true,
                render: (order) => (
                  <>
                    <p className="font-display text-lg tracking-wide">{order.reference}</p>
                    <p className="text-xs text-muted">
                      {order.payment.installments.length}{' '}
                      {order.payment.installments.length === 1 ? t("installment") : t("installments")}
                    </p>
                  </>
                ),
              },
              {
                label: t("Buyer"),
                primary: true,
                render: (order) => (
                  <>
                    <p className="font-semibold">{order.buyer_name}</p>
                    <p className="text-xs text-muted">{order.buyer_company ?? order.city}</p>
                  </>
                ),
              },
              {
                label: t("Total due"),
                num: true,
                render: (order) => <span className="font-semibold">{sar(order.payment.total_due)}</span>,
              },
              { label: t("Paid"), num: true, render: (order) => sar(order.payment.total_paid) },
              {
                label: t("Balance"),
                num: true,
                render: (order) => (
                  <span className="font-semibold">
                    {sar(round2(Number(order.payment.total_due) - Number(order.payment.total_paid)))}
                  </span>
                ),
              },
              {
                label: t("Status"),
                render: (order) => (
                  <Badge tone={PAYMENT_STATUS_TONE[order.payment.status]}>
                    {t(PAYMENT_STATUS_LABEL[order.payment.status])}
                  </Badge>
                ),
              },
            ]}
          />
        </>
      )}

      {receipt && (
        <DocumentModal
          order={receipt.order}
          installment={receipt.installment}
          sellerVatNumber={sellerVat}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}
