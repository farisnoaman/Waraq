import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import {
  formatDate,
  formatDateTime,
  PAYMENT_METHOD_LABEL,
  round2,
  sar,
  ltr,
} from '../lib/format';
import {
  PHONE_DISPLAY,
  SITE_DOMAIN,
  SITE_EMAIL,
  SITE_NAME,
  SITE_POSTAL_CODE,
  SITE_SHORT_ADDRESS,
  SITE_VAT_NUMBER,
  siteAddress,
} from '../lib/site';
import type { Installment, Order } from '../lib/types';
import Logo from './Logo';
import { OrderItemsTable, OrderSummary } from './OrderBreakdown';
import { t, useLang } from '../lib/i18n';

interface Props {
  order: Order;
  /** When given, the document is a payment receipt for this installment; otherwise an order bill. */
  installment?: Installment | null;
  sellerVatNumber?: string;
  onClose: () => void;
}

/** Printable order bill / payment receipt with the VAT breakdown. */
export default function DocumentModal({ order, installment, sellerVatNumber, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const isReceipt = Boolean(installment);
  const lang = useLang();
  // Bills always carry the company VAT: fall back to the registered number
  // when the administrator has not saved one in Settings yet.
  const vat = sellerVatNumber || SITE_VAT_NUMBER;

  useEffect(() => {
    document.documentElement.classList.add('doc-open');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.classList.remove('doc-open');
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // While the document is open, the tab title becomes the suggested file name
  // for "Save as PDF": buyer - document number - weekday dd mmm yyyy.
  useEffect(() => {
    const previous = document.title;
    const datePart = new Intl.DateTimeFormat('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
      .format(new Date(order.created_at))
      .replace(/,/g, '');
    const documentNumber = isReceipt
      ? (installment?.receipt_number ?? order.reference)
      : order.reference;
    document.title = `${order.buyer_name} - ${documentNumber} - ${datePart}`;
    return () => {
      document.title = previous;
    };
  }, [order, isReceipt, installment]);

  const totalDue = Number(order.payment?.total_due ?? order.total);
  const balanceAfter = installment ? Number(installment.balance_after) : 0;
  const paidToDate = installment ? round2(totalDue - balanceAfter) : 0;
  const delivery = order.delivery;
  const title = t(isReceipt ? 'Payment receipt' : 'Order bill');

  return createPortal(
    <div
      className="doc-overlay fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-forest/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} ${isReceipt ? installment?.receipt_number : order.reference}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="doc-sheet my-auto w-full max-w-4xl rounded-2xl border border-line bg-white p-5 text-ink shadow-2xl sm:p-8">
        <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <p className="text-sm text-muted">
            {t("Print this page, or choose “Save as PDF” in the print dialog.")}
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden="true" />
              {t("Print")}
            </button>
            <button ref={closeRef} type="button" className="btn btn-outline btn-sm" onClick={onClose}>
              <X className="h-4 w-4" aria-hidden="true" />
              {t("Close")}
            </button>
          </div>
        </div>

        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Logo />
            <p className="mt-3 text-sm text-muted">
              {SITE_NAME} · {SITE_DOMAIN}
              <br />
              {siteAddress(lang)}
              <br />
              {t("Postal code")}{' '}{SITE_POSTAL_CODE} · {t("Short address")}{' '}{SITE_SHORT_ADDRESS}
              <br />
              {SITE_EMAIL} · {PHONE_DISPLAY}
              {vat ? (
                <>
                  <br />
                  {t("VAT registration no.")}{' '}<span className="font-semibold text-ink">{vat}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className="text-start sm:text-end">
            <p className="eyebrow text-primary-strong">
              {title}{' '}
              <span lang="ar" dir="rtl" className="font-arabic normal-case tracking-normal rtl:hidden">
                {isReceipt ? '· إيصال استلام' : '· فاتورة'}
              </span>
            </p>
            <p className="mt-1 font-display text-3xl tracking-wide text-ink">
              {isReceipt ? installment?.receipt_number : order.reference}
            </p>
            <dl className="mt-2 space-y-0.5 text-sm text-muted">
              {isReceipt && (
                <div>
                  <dt className="inline">{t("Order")}{' '}</dt>
                  <dd className="inline font-semibold text-ink">{order.reference}</dd>
                </div>
              )}
              <div>
                <dt className="inline">{isReceipt ? t("Received on") + " " : t("Order date") + " "}</dt>
                <dd className="inline font-semibold text-ink">
                  {isReceipt ? formatDateTime(installment?.created_at) : formatDate(order.created_at)}
                </dd>
              </div>
            </dl>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line p-4 text-sm">
            <h3 className="eyebrow font-sans text-muted">{t("Buyer")}</h3>
            <p className="mt-2 font-semibold text-ink">{order.buyer_name}</p>
            {order.buyer_company && <p>{order.buyer_company}</p>}
            <p className="break-all text-muted">{order.buyer_email}</p>
            {order.buyer_phone && <p className="text-muted">{ltr(order.buyer_phone)}</p>}
            <p className="mt-1 text-muted">
              {order.city}
              {order.address ? ` · ${order.address}` : ''}
            </p>
          </div>
          <div className="rounded-xl border border-line p-4 text-sm">
            <h3 className="eyebrow font-sans text-muted">
              {isReceipt ? t("Received by") : t("Delivery")}
            </h3>
            {isReceipt ? (
              <>
                <p className="mt-2 font-semibold text-ink">{installment?.receiver_name}</p>
                <p className="text-muted">
                  {t("Method:")}{' '}{installment ? t(PAYMENT_METHOD_LABEL[installment.method]) : ''}
                </p>
                {installment?.receiver_reference && (
                  <p className="text-muted">{t("Reference:")}{' '}{installment.receiver_reference}</p>
                )}
                {delivery?.staff_name && (
                  <p className="mt-1 text-muted">
                    {t("Delivered by")}{' '}{delivery.staff_name}
                    {delivery.vehicle_plate ? ` · ${delivery.vehicle_type} ${delivery.vehicle_plate}` : ''}
                  </p>
                )}
              </>
            ) : delivery?.staff_name ? (
              <>
                <p className="mt-2 font-semibold text-ink">{delivery.staff_name}</p>
                {delivery.staff_phone && <p className="text-muted">{ltr(delivery.staff_phone)}</p>}
                <p className="text-muted">
                  {delivery.vehicle_type} · {delivery.vehicle_plate}
                </p>
                {delivery.delivered_at && (
                  <p className="text-muted">{t("Delivered")}{' '}{formatDateTime(delivery.delivered_at)}</p>
                )}
              </>
            ) : (
              <p className="mt-2 text-muted">{t("A delivery team member has not been assigned yet.")}</p>
            )}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-ink">
            {t("Items and VAT breakdown")}{' '}
            <span lang="ar" dir="rtl" className="font-arabic font-normal text-muted rtl:hidden">
              ضريبة القيمة المضافة
            </span>
          </h3>
          <OrderItemsTable order={order} />
        </section>

        <section className={`mt-5 grid gap-4 ${isReceipt ? 'lg:grid-cols-2' : 'sm:ms-auto sm:max-w-md'}`}>
          <OrderSummary order={order} />
          {isReceipt && installment && (
            <dl className="rounded-xl border border-line bg-card p-4 text-sm sm:p-5">
              <div className="flex justify-between gap-4 border-b border-line/70 pb-1.5">
                <dt className="text-muted">{t("Total due (incl. VAT)")}</dt>
                <dd className="font-semibold tabular-nums">{sar(totalDue)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-1.5">
                <dt className="font-semibold text-ink">{t("Amount received (this receipt)")}</dt>
                <dd className="font-display text-2xl font-semibold tabular-nums text-primary-strong">
                  {sar(installment.amount)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-line/70 py-1.5">
                <dt className="text-muted">{t("Paid to date")}</dt>
                <dd className="font-semibold tabular-nums">{sar(paidToDate)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 pt-2">
                <dt className="font-semibold text-ink">{t("Remaining balance")}</dt>
                <dd className="font-display text-xl font-semibold tabular-nums text-ink">
                  {sar(balanceAfter)}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <footer className="mt-8 grid gap-6 border-t border-line pt-5 text-sm text-muted sm:grid-cols-2">
          <p>
            {t("Thank you for doing business with")}{' '}{SITE_NAME} ({SITE_DOMAIN}).
            {isReceipt ? " " + t("Please keep this receipt for your records.") : " " + t("Amounts are in Saudi riyals (SAR).")}
          </p>
          <div className="sm:text-end">
            <p className="inline-block min-w-56 border-t border-ink/40 pt-1.5 text-xs uppercase tracking-wider">
              {isReceipt ? t("Received by · {0}", [installment?.receiver_name ?? '']) : t("Authorised signature / stamp")}
            </p>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
