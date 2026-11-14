import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Plus, Send, X, XCircle } from 'lucide-react';
import { Alert, Badge, ErrorPanel, Spinner, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { Vehicle, VehicleMovementRequest } from '../../lib/types';
import { schemas, validate, type FieldErrors } from '../../lib/validation';
import { TabIntro, useAction, type OpsProps } from './shared';
import { t } from '../../lib/i18n';

type VehiclesPayload = { vehicles: Vehicle[]; movements: VehicleMovementRequest[] };

export default function RequestsTab({ isAdmin, me }: OpsProps) {
  const [data, setData] = useState<VehiclesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'primary' | 'secondary'>('primary');

  const load = useCallback(async () => {
    try {
      setData(await api<VehiclesPayload>('/api/vehicles'));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const action = useAction(load);

  const [mForm, setMForm] = useState({ vehicle_id: '', reason: '', departure_odometer: '' });
  const [mErr, setMErr] = useState<FieldErrors>({});
  const [showForm, setShowForm] = useState(false);

  const requestMove = async (e: FormEvent) => {
    e.preventDefault();
    const result = validate(schemas.movementRequest, mForm);
    if (!result.ok) {
      setMErr(result.errors);
      return;
    }
    setMErr({});
    const ok = await action.run('move-req', () =>
      api('/api/vehicles?resource=movement', { method: 'POST', body: result.data }),
    );
    if (ok) {
      setMForm({ vehicle_id: '', reason: '', departure_odometer: '' });
      setShowForm(false);
      if (!isAdmin) setTab('secondary');
    }
  };

  const [returnOdo, setReturnOdo] = useState<Record<number, string>>({});
  const decide = (
    id: number,
    act: 'approve' | 'reject' | 'complete' | 'cancel',
    extra: Record<string, unknown> = {},
  ) => action.run(`mv-${act}-${id}`, () => api('/api/vehicles?resource=movement', { method: 'PUT', body: { id, action: act, ...extra } }));

  if (error) return <ErrorPanel message={error} onRetry={() => void load()} />;
  if (loading || !data) {
    return (
      <div className="space-y-4" role="status">
        <p className="sr-only">{t('Loading')}</p>
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    );
  }

  const vehicles = data.vehicles.filter((v) => v.is_active);
  const movements = data.movements;
  const pending = movements.filter((m) => m.status === 'pending');
  const history = movements.filter((m) => m.status !== 'pending');

  const primaryLabel = isAdmin ? t('New requests') : t('New movement request');
  const secondaryLabel = isAdmin ? t('Request history') : t('My requests');

  const renderList = (list: VehicleMovementRequest[], emptyText: string, showApprove: boolean) => {
    if (list.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
    return (
      <ul className="divide-y divide-line">
        {list.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{m.vehicle_name ?? `#${m.vehicle_id}`}</span>
                <span className="text-sm text-muted" dir="ltr">{m.vehicle_plate}</span>
                <Badge tone={m.status === 'approved' ? 'mint' : m.status === 'pending' ? 'brass' : m.status === 'completed' ? 'solid' : m.status === 'rejected' ? 'danger' : 'neutral'}>{t(m.status)}</Badge>
              </div>
              <p className="mt-1 text-sm">{m.reason}</p>
              <p className="mt-0.5 text-xs text-muted">{t('Requested by')} {m.requester_name ?? '—'} · {formatDateTime(m.created_at)}</p>
              {m.departure_odometer != null && <p className="text-xs text-muted">{t('Departure odometer')}: <span dir="ltr">{m.departure_odometer}</span> {t('km')}</p>}
              {m.return_odometer != null && <p className="text-xs text-muted">{t('Return odometer')}: <span dir="ltr">{m.return_odometer}</span> {t('km')}</p>}
              {m.rejected_reason && <p className="text-xs text-danger">{t('Reason')}: {m.rejected_reason}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {showApprove && isAdmin && m.status === 'pending' && (
                <>
                  <button type="button" className="btn btn-primary btn-sm" disabled={action.busy !== null} onClick={() => void decide(m.id, 'approve')}><Check className="h-4 w-4" aria-hidden="true" />{t('Approve')}</button>
                  <button type="button" className="btn btn-outline btn-sm" disabled={action.busy !== null} onClick={() => void decide(m.id, 'reject', { rejected_reason: t('Rejected by administrator') })}><XCircle className="h-4 w-4" aria-hidden="true" />{t('Reject')}</button>
                </>
              )}
              {m.status === 'approved' && (isAdmin || m.requested_by === me.id) && (
                <div className="flex flex-wrap items-center gap-2">
                  <input className="field-input field-sm w-36" inputMode="numeric" placeholder={t('Return odometer')} value={returnOdo[m.id] ?? ''} onChange={(e) => setReturnOdo((s) => ({ ...s, [m.id]: e.target.value }))} />
                  <button type="button" className="btn btn-primary btn-sm" disabled={action.busy !== null} onClick={() => void decide(m.id, 'complete', { return_odometer: returnOdo[m.id] || null })}><Check className="h-4 w-4" aria-hidden="true" />{t('Complete (returned)')}</button>
                </div>
              )}
              {['pending', 'approved'].includes(m.status) && (isAdmin || m.requested_by === me.id) && (
                <button type="button" className="btn btn-ghost btn-sm text-muted" disabled={action.busy !== null} onClick={() => void decide(m.id, 'cancel')}><X className="h-4 w-4" aria-hidden="true" />{t('Cancel')}</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="space-y-6">
      <TabIntro title={t('Requests')}>
        {isAdmin
          ? t('Review vehicle movement requests, approve new requests, and view request history.')
          : t('Request permission to move a vehicle and track your requests.')}
      </TabIntro>

      {action.error && <Alert>{action.error}</Alert>}

      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-line bg-paper-deep/40 p-1.5">
        <button
          type="button"
          onClick={() => setTab('primary')}
          className={`min-h-11 rounded-xl px-3 text-sm font-semibold transition-colors ${tab === 'primary' ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          aria-pressed={tab === 'primary'}
        >
          {primaryLabel}
          {isAdmin && pending.length > 0 && <span className="ms-2 rounded-full bg-brass/20 px-2 py-0.5 text-xs text-brass">{pending.length}</span>}
        </button>
        <button
          type="button"
          onClick={() => setTab('secondary')}
          className={`min-h-11 rounded-xl px-3 text-sm font-semibold transition-colors ${tab === 'secondary' ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
          aria-pressed={tab === 'secondary'}
        >
          {secondaryLabel}
        </button>
      </div>

      <div className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        {tab === 'primary' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xl">{t('New movement request')}</h3>
                <p className="mt-1 text-sm text-muted">{t('No delivery order? Request permission to move a vehicle. Only an administrator can approve.')}</p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => { setShowForm((v) => !v); setMErr({}); }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('New car request')}
              </button>
            </div>

            {showForm && (
              vehicles.length === 0 ? (
                <p className="mt-5 text-sm text-muted">{t('No active vehicles available right now.')}</p>
              ) : (
                <form onSubmit={requestMove} noValidate className="mt-5 grid gap-4 rounded-xl border border-line bg-paper-deep/30 p-4 sm:grid-cols-2">
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label htmlFor="mv-veh" className="mb-1.5 block text-sm font-semibold">{t('Vehicle')}</label>
                    <select id="mv-veh" className="field-input field-sm" value={mForm.vehicle_id} onChange={(e) => setMForm((f) => ({ ...f, vehicle_id: e.target.value }))} aria-invalid={mErr.vehicle_id ? true : undefined}>
                      <option value="">{t('Select vehicle')}</option>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.plate_number}</option>)}
                    </select>
                    {mErr.vehicle_id && <p className="mt-1.5 text-sm font-medium text-danger">{mErr.vehicle_id}</p>}
                  </div>
                  <TextField id="mv-dep" label={t('Departure odometer')} inputMode="numeric" value={mForm.departure_odometer} onChange={(e) => setMForm((f) => ({ ...f, departure_odometer: e.target.value }))} error={mErr.departure_odometer} hint={t('Optional — record when leaving')} />
                  <TextField id="mv-reason" label={t('Reason')} required value={mForm.reason} onChange={(e) => setMForm((f) => ({ ...f, reason: e.target.value }))} error={mErr.reason} className="sm:col-span-2" />
                  <div className="flex flex-wrap gap-2 sm:col-span-2">
                    <button type="submit" className="btn btn-primary" disabled={action.busy === 'move-req'}>
                      {action.busy === 'move-req' ? <Spinner /> : <Send className="h-4 w-4" aria-hidden="true" />}
                      {t('Submit request')}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>{t('Cancel')}</button>
                  </div>
                </form>
              )
            )}

            {isAdmin && (
              <div className="mt-8 border-t border-line pt-6">
                <h4 className="text-lg font-semibold">{t('New requests')}</h4>
                <p className="mt-1 text-sm text-muted">{t('Pending vehicle movement requests awaiting your approval.')}</p>
                <div className="mt-4">{renderList(pending, t('No new requests.'), true)}</div>
              </div>
            )}
          </>
        ) : (
          <>
            <h3 className="text-xl">{secondaryLabel}</h3>
            <p className="mt-1 text-sm text-muted">{isAdmin ? t('Approved, rejected, completed and cancelled requests.') : t('Your vehicle movement requests.')}</p>
            <div className="mt-4">{renderList(isAdmin ? history : movements, isAdmin ? t('No request history.') : t('No requests yet.'), false)}</div>
          </>
        )}
      </div>
    </div>
  );
}
