import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ClipboardList,
  LockKeyhole,
  Plus,
  Printer,
  Send,
  Trash2,
} from 'lucide-react';
import DocumentModal from '../components/DocumentModal';
import WhatsAppIcon from '../components/WhatsAppIcon';
import { OrderItemsTable, OrderSummary } from '../components/OrderBreakdown';
import QtyStepper from '../components/QtyStepper';
import {
  Alert,
  ErrorPanel,
  PageHeader,
  Spinner,
  TextAreaField,
  TextField,
  usePageTitle,
} from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useRequestList } from '../contexts/RequestListContext';
import { api, ApiError, errorMessage, useApi } from '../lib/api';
import { percent, round2, sar } from '../lib/format';
import { whatsappLink, PHONE_DISPLAY } from '../lib/site';
import type { Order, Product } from '../lib/types';
import { schemas, validate, type FieldErrors } from '../lib/validation';
import { t } from '../lib/i18n';

const FIELD_ORDER = ['name', 'company', 'phone', 'city', 'address', 'notes'];

interface PlacedOrder {
  order: Order;
  seller_vat_number: string;
}

export default function RequestPage() {
  usePageTitle(t('Request list'), { noIndex: true });
  const { profile, loading: authLoading } = useAuth();
  const products = useApi<Product[]>('/api/products');
  const { lines, setQty, remove, clear } = useRequestList();

  const [values, setValues] = useState({
    name: '',
    company: '',
    phone: '',
    city: 'Riyadh',
    address: '',
    notes: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [showBill, setShowBill] = useState(false);

  // Prefill from the signed-in profile without overwriting what was typed.
  useEffect(() => {
    if (!profile) return;
    setValues((current) => ({
      ...current,
      name: current.name || profile.full_name || '',
      company: current.company || profile.company || '',
      phone: current.phone || profile.phone || '',
    }));
  }, [profile]);

  const rows = useMemo(() => {
    const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
    return lines
      .map((line) => ({ line, product: byId.get(line.productId) }))
      .filter((row): row is { line: (typeof lines)[number]; product: Product } => Boolean(row.product));
  }, [lines, products.data]);

  // Preview only: the server recalculates every figure from its own prices.
  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    let units = 0;
    for (const { line, product } of rows) {
      const lineSubtotal = round2(line.qty * product.unit_price);
      subtotal = round2(subtotal + lineSubtotal);
      vat = round2(vat + round2((lineSubtotal * product.vat_rate) / 100));
      units += line.qty;
    }
    return { subtotal, vat, units, total: round2(subtotal + vat) };
  }, [rows]);

  const belowMoq = rows.filter(({ line, product }) => line.qty < product.moq);

  const set =
    (key: keyof typeof values) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((current) => ({ ...current, [key]: event.target.value }));
      setErrors((current) => ({ ...current, [key]: '' }));
    };

  const focusFirst = (fields: FieldErrors) => {
    const first = FIELD_ORDER.find((key) => fields[key]);
    if (first) document.getElementById(`rq-${first}`)?.focus();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || !profile) return;
    setFailure(null);

    const result = validate(schemas.orderDetails, values);
    if (!result.ok) {
      setErrors(result.errors);
      focusFirst(result.errors);
      return;
    }
    if (rows.length === 0) {
      setFailure(t("Your request list is empty. Add at least one product before placing an order."));
      return;
    }
    if (belowMoq.length > 0) {
      setFailure(
        t("{0} has a minimum order quantity of {1}. Increase the quantity to continue.", [belowMoq[0].product.name, belowMoq[0].product.moq]),
      );
      return;
    }

    setSending(true);
    try {
      const response = await api<PlacedOrder>('/api/orders', {
        method: 'POST',
        body: {
          ...result.data,
          items: rows.map(({ line, product }) => ({ product_id: product.id, qty: line.qty })),
        },
      });
      setPlaced(response);
      clear();
      setErrors({});
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) {
        setErrors(err.fields);
        focusFirst(err.fields);
      }
      setFailure(errorMessage(err, 'We could not place your order. Please try again.'));
    } finally {
      setSending(false);
    }
  };

  if (placed) {
    const { order } = placed;

    const orderMessage = () => {
      const lines = order.items
        .map(
          (item) =>
            `- ${item.product_name} (${item.sku}) — ${item.qty} × ${item.unit_price} = ${item.line_total} SAR`,
        )
        .join('\n');
      return [
        'Waraq Pro — order request',
        `Order reference: ${order.reference}`,
        `Buyer: ${order.buyer_name}${order.buyer_company ? ` — ${order.buyer_company}` : ''}`,
        order.buyer_phone ? `Phone: ${order.buyer_phone}` : '',
        `City: ${order.city}`,
        order.address ? `Address: ${order.address}` : '',
        '',
        'Items:',
        lines,
        '',
        `Subtotal: ${order.subtotal} SAR`,
        `VAT: ${order.vat_total} SAR`,
        `Total: ${order.total} SAR`,
        order.notes ? `Notes: ${order.notes}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    };

    return (
      <>
        <PageHeader eyebrow={t("Order placed")} title={t("Your order has been received.")} />
        <section className="container-x py-12 lg:py-16">
          <div
            className="mx-auto max-w-4xl rounded-2xl border border-line bg-card p-6 sm:p-10"
            role="status"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="grid h-14 w-14 place-items-center rounded-full bg-mint text-primary-strong">
                  <Check className="h-7 w-7" aria-hidden="true" />
                </span>
                <p className="mt-6 text-sm text-muted">{t("Order reference")}</p>
                <p className="font-display text-4xl tracking-wide text-primary-strong">
                  {order.reference}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBill(true)}
                className="btn btn-outline bg-white"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                {t("Print order bill")}
              </button>
            </div>

            <p className="mt-6 text-lg text-muted">
              {t("Thank you,")}{' '}{order.buyer_name}{t(". Your order is saved in your")}{' '}
              <Link to="/buyer" className="font-semibold text-primary-strong underline underline-offset-4">
                {t("buyer portal")}
              </Link>{' '}
              {t("and is waiting for the Waraq Pro team to confirm it.")}
            </p>

            <div className="mt-8">
              <OrderItemsTable order={order} />
            </div>
            <OrderSummary order={order} className="mt-5 sm:ms-auto sm:max-w-md" />

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={whatsappLink(orderMessage())}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary bg-[#25D366] text-forest hover:bg-[#20bd5a]"
              >
                <WhatsAppIcon className="h-4 w-4" />
                {t("Send order to WhatsApp")}
              </a>
              <Link to="/buyer" className="btn btn-outline">
                {t("Track order in buyer portal")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link to="/products" className="btn btn-outline">
                {t("Back to products")}
              </Link>
            </div>
            <p className="mt-4 text-sm text-muted">{t("Send it to us on WhatsApp for the fastest response.")}</p>
          </div>
        </section>
        {showBill && (
          <DocumentModal
            order={order}
            sellerVatNumber={placed.seller_vat_number}
            onClose={() => setShowBill(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={t("Request list")}
        title={t("Your request list and order bill")}
        description={t("Check the quantities, review the VAT breakdown for each item, and place your order. It appears in your buyer portal straight away.")}
      />

      <section className="container-x grid gap-10 py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-14">
        <div>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl sm:text-3xl">
              {t("Items")}{' '}<span className="text-muted">({rows.length})</span>
            </h2>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-paper-deep hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {t("Clear list")}
              </button>
            )}
          </div>

          <div className="mt-5">
            {products.error ? (
              <ErrorPanel message={products.error} onRetry={products.reload} />
            ) : products.loading && lines.length > 0 ? (
              <div className="space-y-3">
                <p className="sr-only" role="status">
                  {t("Loading your list")}
                </p>
                {lines.map((line) => (
                  <div key={line.productId} className="skeleton h-28 rounded-2xl" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-start rounded-2xl border border-dashed border-line bg-card p-6 sm:p-8">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-primary-strong">
                  <ClipboardList className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-2xl">{t("Your list is empty")}</h3>
                <p className="mt-2 text-muted">
                  {t("Add products from the catalogue to build your order. Looking for something that is not listed?")}{' '}
                  <Link to="/contact" className="font-semibold text-primary-strong underline underline-offset-4">
                    {t("Tell us what you need")}
                  </Link>
                  .
                </p>
                <Link to="/products" className="btn btn-primary mt-5">
                  {t("Browse products")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {rows.map(({ line, product }) => {
                    const lineSubtotal = round2(line.qty * product.unit_price);
                    const lineVat = round2((lineSubtotal * product.vat_rate) / 100);
                    return (
                      <li
                        key={product.id}
                        className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3 sm:p-4"
                      >
                        <div className="flex gap-4">
                          <Link to={`/products/${product.slug}`} className="shrink-0" tabIndex={-1} aria-hidden="true">
                            <img
                              src={product.image}
                              alt=""
                              loading="lazy"
                              className="h-20 w-20 rounded-xl object-cover sm:h-24 sm:w-24"
                            />
                          </Link>
                          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <Link
                                to={`/products/${product.slug}`}
                                className="font-display text-xl leading-snug hover:text-primary-strong"
                              >
                                {t(product.name)}
                              </Link>
                              <p className="mt-0.5 text-sm text-muted">
                                {t(product.pack_unit)}{' '}{t("· MOQ")}{' '}{product.moq}
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                {t("Unit:")}{' '}{sar(product.unit_price)}{' '}{t("+ VAT")}{' '}{percent(product.vat_rate)} (
                                {sar(product.vat_value)}{' '}{t("per item)")}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <QtyStepper
                                value={line.qty}
                                min={product.moq}
                                onChange={(next) => setQty(product.id, next)}
                                label={t(product.name)}
                              />
                              <button
                                type="button"
                                onClick={() => remove(product.id)}
                                aria-label={t("Remove {0} from request list", [product.name])}
                                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-paper-deep hover:text-danger"
                              >
                                <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs">
                          <span className="text-muted">
                            {t("Subtotal")}{' '}{sar(lineSubtotal)}{' '}{t("· VAT (")}{percent(product.vat_rate)}){' '}
                            {sar(lineVat)}
                          </span>
                          <span className="font-bold text-primary-strong">
                            {t("Item total incl. VAT:")}{' '}{sar(lineSubtotal + lineVat)}
                          </span>
                        </div>
                        {line.qty < product.moq && (
                          <p className="text-sm font-medium text-danger">
                            {t("The minimum order quantity for this product is")}{' '}{product.moq}.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-5 rounded-2xl border border-primary/30 bg-mint/40 p-5 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary-strong">
                    {t("Order summary")}
                  </p>
                  <dl>
                  <div className="mt-3 flex justify-between gap-4 border-b border-line/70 pb-1.5">
                    <dt className="text-muted">{t("Items")}</dt>
                    <dd className="font-semibold tabular-nums">
                      {rows.length} {rows.length === 1 ? t("line") : t("lines")} · {totals.units}{' '}{t("units")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-line/70 py-1.5">
                    <dt className="text-muted">{t("Items total (excl. VAT)")}</dt>
                    <dd className="font-semibold tabular-nums">{sar(totals.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 border-b border-line/70 py-1.5">
                    <dt className="text-muted">{t("VAT total")}</dt>
                    <dd className="font-semibold tabular-nums text-primary-strong">
                      {sar(totals.vat)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 pt-2 text-base">
                    <dt className="font-semibold">{t("Final payable total (incl. VAT)")}</dt>
                    <dd className="font-display text-2xl font-semibold tabular-nums text-primary-strong">
                      {sar(totals.total)}
                    </dd>
                  </div>
                  </dl>
                </div>
              </>
            )}
          </div>

          {rows.length > 0 && (
            <Link
              to="/products"
              className="mt-5 inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary-strong underline decoration-2 underline-offset-4 hover:decoration-primary"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("Add more products")}
            </Link>
          )}
        </div>

        <div className="relative rounded-2xl border border-line bg-card p-5 sm:p-8 lg:sticky lg:top-24 lg:self-start">
          {authLoading ? (
            <div className="flex items-center gap-3 py-8 text-muted" role="status">
              <Spinner className="h-5 w-5 text-primary" />
              {t("Checking your session…")}
            </div>
          ) : !profile ? (
            <div>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-mint text-primary-strong">
                <LockKeyhole className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-3xl">{t("Sign in to place your order")}</h2>
              <p className="mt-2 text-muted">
                {t("Orders are saved to your account so you can track every step, confirm delivery and view your bills in the buyer portal. Your list is kept while you sign in.")}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link to="/login?next=%2Frequest" className="btn btn-primary">
                  {t("Sign in or create an account")}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <p className="mt-5 text-sm text-muted">
                {t("You can sign in with Google or with your email address.")}
              </p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate aria-labelledby="request-form-title">
              <h2 id="request-form-title" className="text-3xl">
                {t("Delivery details")}
              </h2>
              <p className="mt-2 text-sm text-muted">
                {t("Ordering as")}{' '}<span className="font-semibold text-ink">{profile.email}</span>{t(". Fields marked")}{' '}<span className="text-danger">*</span>{' '}{t("are required.")}
              </p>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <TextField
                  id="rq-name"
                  label={t("Full name")}
                  required
                  autoComplete="name"
                  maxLength={120}
                  value={values.name}
                  onChange={set('name')}
                  error={errors.name}
                />
                <TextField
                  id="rq-company"
                  label={t("Company")}
                  autoComplete="organization"
                  maxLength={160}
                  value={values.company}
                  onChange={set('company')}
                  error={errors.company}
                />
                <TextField
                  id="rq-phone"
                  label={t("Phone")}
                  type="tel"
                  autoComplete="tel"
                  placeholder={PHONE_DISPLAY}
                  maxLength={20}
                  value={values.phone}
                  onChange={set('phone')}
                  error={errors.phone}
                />
                <TextField
                  id="rq-city"
                  label={t("Delivery city")}
                  required
                  autoComplete="address-level2"
                  placeholder={t("For example, Riyadh")}
                  maxLength={80}
                  value={values.city}
                  onChange={set('city')}
                  error={errors.city}
                />
                <div className="sm:col-span-2">
                  <TextField
                    id="rq-address"
                    label={t("Delivery address")}
                    autoComplete="street-address"
                    maxLength={300}
                    value={values.address}
                    onChange={set('address')}
                    error={errors.address}
                    hint={t("District, street and building. You can also confirm this later.")}
                  />
                </div>
                <div className="sm:col-span-2">
                  <TextAreaField
                    id="rq-notes"
                    label={t("Notes")}
                    rows={4}
                    maxLength={1500}
                    value={values.notes}
                    onChange={set('notes')}
                    error={errors.notes}
                    hint={t("Sizes, brands or a preferred delivery date.")}
                  />
                </div>
              </div>

              {failure && <Alert className="mt-6">{failure}</Alert>}

              <button
                type="submit"
                className="btn btn-primary mt-7 w-full"
                disabled={sending || rows.length === 0}
              >
                {sending ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />}
                {sending
                  ? t("Placing order")
                  : t("Place order ({0} {1} · {2})", [rows.length, rows.length === 1 ? t("item") : t("items"), sar(totals.total)])}
              </button>
              {rows.length === 0 && (
                <p className="mt-3 text-sm text-muted">{t("Add a product to your list to place an order.")}</p>
              )}
            </form>
          )}
        </div>
      </section>
    </>
  );
}
