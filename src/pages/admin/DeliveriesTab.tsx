import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Lock,
  MapPin,
  PackageCheck,
  Send,
  Truck,
  UserCheck,
  UserRound,
} from 'lucide-react';
import { Alert, Badge, Spinner } from '../../components/ui';
import { api, ApiError, errorMessage } from '../../lib/api';
import {
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUS_TONE,
  formatDateTime,
  ORDER_STATUS_LABEL,
  sar,
  ltr,
} from '../../lib/format';
import type { Delivery, Order, StaffMember } from '../../lib/types';
import { schemas, validate, type FieldErrors } from '../../lib/validation';
import { EmptyState, TabIntro, useAction, type OpsProps } from './shared';
import { t } from '../../lib/i18n';

interface CardProps extends OpsProps {
  order: Order;
  delivery: Delivery;
  staff: StaffMember[];
}

function Timeline({ order, delivery }: { order: Order; delivery: Delivery }) {
  const steps = [
    { label: 'Draft created', at: delivery.created_at, done: true },
    { label: 'Staff assigned', at: delivery.assigned_at, done: Boolean(delivery.staff_id) },
    { label: 'Accepted by staff', at: delivery.staff_accepted_at, done: Boolean(delivery.staff_accepted_at) },
    { label: 'Dispatched', at: delivery.dispatched_at, done: Boolean(delivery.dispatched_at) },
    { label: 'Reception confirmed by staff', at: delivery.delivered_at, done: delivery.status === 'delivered' },
    {
      label: 'Confirmed by buyer (optional)',
      at: order.buyer_confirmed_at,
      done: Boolean(order.buyer_confirmed_at),
    },
  ];
  return (
    <ol className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
      {steps.map((step) => (
        <li key={step.label} className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
              step.done ? 'bg-primary text-white' : 'border border-line bg-white text-transparent'
            }`}
            aria-hidden="true"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
          <span>
            <span className={step.done ? 'font-semibold text-ink' : 'text-muted'}>{t(step.label)}</span>
            <span className="block text-xs text-muted">
              {step.done ? formatDateTime(step.at) : t("Not yet")}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function DeliveryCard({ order, delivery, staff, isAdmin, me, reload }: CardProps) {
  const action = useAction(reload);
  const [form, setForm] = useState({
    staff_id: delivery.staff_id ?? '',
    vehicle_type: delivery.vehicle_type ?? '',
    vehicle_plate: delivery.vehicle_plate ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  // Keep the form in step with the server when another person changes the delivery.
  useEffect(() => {
    setForm({
      staff_id: delivery.staff_id ?? '',
      vehicle_type: delivery.vehicle_type ?? '',
      vehicle_plate: delivery.vehicle_plate ?? '',
    });
  }, [delivery.staff_id, delivery.vehicle_type, delivery.vehicle_plate]);

  const accepted = Boolean(delivery.staff_accepted_at);
  const mine = delivery.staff_id === me.id;
  const canAssign = isAdmin && (delivery.status === 'draft' || delivery.status === 'assigned');
  const canAccept = !isAdmin && mine && delivery.status === 'assigned' && !accepted;
  const canDispatch = (isAdmin || mine) && delivery.status === 'assigned' && accepted;
  const canDeliver = (isAdmin || mine) && delivery.status === 'dispatched';
  const id = `dl-${delivery.id}`;

  const assign = async (event: FormEvent) => {
    event.preventDefault();
    const result = validate(schemas.assign, { id: delivery.id, ...form });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    await action.run('assign', async () => {
      try {
        await api('/api/operations?resource=deliveries', {
          method: 'PUT',
          body: { ...result.data, action: 'assign' },
        });
      } catch (err) {
        if (err instanceof ApiError) setErrors(err.fields);
        throw err;
      }
    });
  };

  const step = (name: 'accept' | 'dispatch' | 'deliver') =>
    action.run(name, () =>
      api('/api/operations?resource=deliveries', {
        method: 'PUT',
        body: { id: delivery.id, action: name },
      }),
    );

  return (
    <li className="rounded-2xl border border-line bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-display text-2xl tracking-wide">{order.reference}</h3>
            <Badge tone={DELIVERY_STATUS_TONE[delivery.status]}>
              {t(DELIVERY_STATUS_LABEL[delivery.status])}
            </Badge>
            {delivery.status === 'assigned' &&
              (accepted ? (
                <Badge tone="dark">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  {t("Locked · accepted by")}{' '}{delivery.staff_name}
                </Badge>
              ) : (
                <Badge tone="brass">{t("Awaiting staff acceptance")}</Badge>
              ))}
          </div>
          <p className="mt-1.5 text-sm text-muted">{t("Order status:")}{' '}{t(ORDER_STATUS_LABEL[order.status])}</p>
          <p className="mt-2 flex items-start gap-2 text-[15px]">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-semibold">{order.city}</span>
              {order.address ? ` · ${order.address}` : ''}
            </span>
          </p>
          <p className="mt-1 flex items-start gap-2 text-sm text-muted">
            <UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="break-all">
              {order.buyer_name}
              {order.buyer_company ? ` · ${order.buyer_company}` : ''}
              {order.buyer_phone ? ` · ${ltr(order.buyer_phone)}` : ''} · {order.buyer_email}
            </span>
          </p>
        </div>
        <div className="text-start sm:text-end">
          <p className="text-xs uppercase tracking-wider text-muted">{t("Order value (incl. VAT)")}</p>
          <p className="font-display text-2xl font-semibold text-primary-strong">{sar(order.total)}</p>
          <p className="text-sm text-muted">
            {order.items.length} {order.items.length === 1 ? t("line") : t("lines")} · {order.total_units}{' '}{t("units")}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-paper-deep/60 p-4">
        <Timeline order={order} delivery={delivery} />
      </div>

      {action.error && <Alert className="mt-4">{action.error}</Alert>}

      {canAssign ? (
        <form onSubmit={assign} noValidate className="mt-5 grid gap-4 border-t border-line pt-5 md:grid-cols-3">
          <div>
            <label htmlFor={`${id}-staff`} className="mb-1.5 block text-sm font-semibold">
              {t("Assigned staff member")}
            </label>
            <select
              id={`${id}-staff`}
              className="field-input field-sm"
              value={form.staff_id}
              disabled={accepted}
              aria-invalid={errors.staff_id ? true : undefined}
              aria-describedby={`${id}-staff-note`}
              onChange={(e) => setForm((f) => ({ ...f, staff_id: e.target.value }))}
            >
              <option value="">{t("Choose staff…")}</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
              {delivery.staff_id && !staff.some((m) => m.id === delivery.staff_id) && (
                <option value={delivery.staff_id}>{delivery.staff_name ?? t("Current assignee")}</option>
              )}
            </select>
            <p
              id={`${id}-staff-note`}
              className={`mt-1.5 text-sm ${errors.staff_id ? 'font-medium text-danger' : 'text-muted'}`}
            >
              {errors.staff_id
                ? errors.staff_id
                : accepted
                  ? t("{0} accepted on {1}. Reassignment is disabled.", [delivery.staff_name, formatDateTime(delivery.staff_accepted_at)])
                  : staff.length === 0
                    ? t("No staff accounts yet. Add one in Users & staff.")
                    : t("Can be changed until the staff member accepts.")}
            </p>
          </div>
          <div>
            <label htmlFor={`${id}-type`} className="mb-1.5 block text-sm font-semibold">
              {t("Vehicle type")}
            </label>
            <input
              id={`${id}-type`}
              className="field-input field-sm"
              placeholder={t("e.g. Isuzu box truck")}
              maxLength={60}
              value={form.vehicle_type}
              aria-invalid={errors.vehicle_type ? true : undefined}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
            />
            {errors.vehicle_type && (
              <p className="mt-1.5 text-sm font-medium text-danger">{errors.vehicle_type}</p>
            )}
          </div>
          <div>
            <label htmlFor={`${id}-plate`} className="mb-1.5 block text-sm font-semibold">
              {t("Vehicle plate number")}
            </label>
            <input
              id={`${id}-plate`}
              className="field-input field-sm"
              placeholder="e.g. JED-4821"
              maxLength={30}
              value={form.vehicle_plate}
              aria-invalid={errors.vehicle_plate ? true : undefined}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_plate: e.target.value }))}
            />
            {errors.vehicle_plate && (
              <p className="mt-1.5 text-sm font-medium text-danger">{errors.vehicle_plate}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2.5 md:col-span-3">
            <button type="submit" className="btn btn-primary btn-sm" disabled={action.busy !== null}>
              {action.busy === 'assign' ? <Spinner /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
              {delivery.status === 'draft'
                ? t("Assign staff")
                : accepted
                  ? t("Update vehicle details")
                  : t("Update assignment")}
            </button>
            {canDispatch && (
              <button
                type="button"
                className="btn btn-dark btn-sm"
                disabled={action.busy !== null}
                onClick={() => void step('dispatch')}
              >
                {action.busy === 'dispatch' ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />}
                {t("Mark dispatched")}
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="mt-5 border-t border-line pt-5">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">{t("Assigned staff")}</dt>
              <dd className="font-semibold">{delivery.staff_name ?? t("Not assigned")}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("Vehicle type")}</dt>
              <dd className="font-semibold">{delivery.vehicle_type ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("Plate number")}</dt>
              <dd className="font-semibold">{delivery.vehicle_plate ?? '—'}</dd>
            </div>
          </dl>
          {(canAccept || canDispatch || canDeliver) && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              {canAccept && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={action.busy !== null}
                  onClick={() => void step('accept')}
                >
                  {action.busy === 'accept' ? <Spinner /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
                  {t("Accept assignment")}
                </button>
              )}
              {canDispatch && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={action.busy !== null}
                  onClick={() => void step('dispatch')}
                >
                  {action.busy === 'dispatch' ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />}
                  {t("Mark dispatched")}
                </button>
              )}
              {canDeliver && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={action.busy !== null}
                  onClick={() => void step('deliver')}
                >
                  {action.busy === 'deliver' ? (
                    <Spinner />
                  ) : (
                    <PackageCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  {isAdmin ? t("Confirm reception for staff") : t("Confirm reception at destination")}
                </button>
              )}
            </div>
          )}
          {canAccept && (
            <p className="mt-3 text-sm text-muted">
              {t("Once you accept, this delivery is yours: the administrator can no longer assign it to someone else.")}
            </p>
          )}
          {canDeliver && (
            <p className="mt-3 text-sm text-muted">
              {t("Confirming reception creates the payment record and the delivery commission. The buyer can also confirm from their portal.")}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function DeliveriesTab(props: OpsProps) {
  const { orders, isAdmin } = props;
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffError, setStaffError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    api<StaffMember[]>('/api/operations?resource=staff')
      .then((list) => {
        if (active) setStaff(list);
      })
      .catch((err) => {
        if (active) setStaffError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  const rows = orders.filter((order): order is Order & { delivery: Delivery } => order.delivery !== null);
  const rank = { draft: 0, assigned: 1, dispatched: 2, delivered: 3 } as const;
  rows.sort(
    (a, b) =>
      rank[a.delivery.status] - rank[b.delivery.status] ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div>
      <TabIntro title={t("Deliveries")}>
        {isAdmin
          ? t("Confirmed orders appear here as draft deliveries. Assign a staff member and vehicle; once the staff member accepts, the delivery is locked to them and cannot be reassigned.")
          : t("Deliveries assigned to you. Accept an assignment, mark it dispatched when you leave, then confirm reception at the destination.")}
      </TabIntro>

      {staffError && <Alert className="mb-5">{t("Staff list could not be loaded:")}{' '}{staffError}</Alert>}

      {rows.length === 0 ? (
        <EmptyState icon={Truck} title={t("No deliveries yet")}>
          {isAdmin
            ? t("Confirm a pending order in the Orders tab to create its draft delivery.")
            : t("You have no assignments at the moment.")}
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {rows.map((order) => (
            <DeliveryCard key={order.delivery.id} {...props} order={order} delivery={order.delivery} staff={staff} />
          ))}
        </ul>
      )}
    </div>
  );
}
