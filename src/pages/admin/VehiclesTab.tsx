import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Bell, Check, Download, Fuel, Gauge, Paperclip, Plus, Wrench } from 'lucide-react';
import { Alert, Badge, ErrorPanel, Spinner, TextField } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { formatDateTime, sar } from '../../lib/format';
import type { Vehicle, VehicleFuelLog, VehicleMaintenanceLog } from '../../lib/types';
import { schemas, validate, type FieldErrors } from '../../lib/validation';
import { TabIntro, useAction, type OpsProps } from './shared';
import { t, useLang } from '../../lib/i18n';

type VehiclesPayload = { vehicles: Vehicle[]; movements: unknown[] };
type LogsPayload = { fuel: VehicleFuelLog[]; maintenance: VehicleMaintenanceLog[] };
type LogTab = 'fuel' | 'maintenance' | 'reminders';

function csvEscape(value: unknown) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: (unknown[])[]) {
  const bom = '\uFEFF';
  const lines = [headers, ...rows].map((r) => r.map(csvEscape).join(','));
  const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function BillUpload({ label, value, onChange }: { label: string; value: { path?: string; url?: string } | null; onChange: (v: { path: string; url: string } | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upload = async (file: File) => {
    setErr(null); setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api<{ url: string; path: string }>(`/api/uploads?folder=vehicle`, { method: 'POST', form });
      onChange({ path: result.path, url: result.url });
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input ref={ref} type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? <Spinner /> : <Paperclip className="h-4 w-4" aria-hidden="true" />}
          {value?.url ? t('Replace bill') : t('Attach bill')}
        </button>
        {value?.url && (
          <>
            <a href={value.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-primary-strong hover:underline">{t('View')}</a>
            <button type="button" className="text-sm text-muted hover:text-danger" onClick={() => onChange(null)}>{t('Remove')}</button>
          </>
        )}
      </div>
      {err && <p className="mt-1.5 text-sm font-medium text-danger">{err}</p>}
    </div>
  );
}

type Reminder = {
  service: string;
  lastDate: string | null;
  lastOdo: number | null;
  kmSince: number | null;
  daysSince: number | null;
  status: 'ok' | 'soon' | 'overdue';
};

function buildReminders(maintenance: VehicleMaintenanceLog[], currentOdo: number): Reminder[] {
  const latest = new Map<string, VehicleMaintenanceLog>();
  for (const m of maintenance) {
    const key = (m.service_type || '').trim() || '—';
    const prev = latest.get(key);
    if (!prev || new Date(m.serviced_at).getTime() > new Date(prev.serviced_at).getTime()) latest.set(key, m);
  }
  const now = Date.now();
  return [...latest.entries()].map(([service, m]) => {
    const daysSince = m.serviced_at ? Math.floor((now - new Date(m.serviced_at).getTime()) / 86400000) : null;
    const kmSince = m.odometer != null ? Math.max(0, currentOdo - Number(m.odometer)) : null;
    let status: Reminder['status'] = 'ok';
    const overdue = (daysSince != null && daysSince >= 365) || (kmSince != null && kmSince >= 10000);
    const soon = !overdue && ((daysSince != null && daysSince >= 180) || (kmSince != null && kmSince >= 5000));
    if (overdue) status = 'overdue';
    else if (soon) status = 'soon';
    return { service, lastDate: m.serviced_at, lastOdo: m.odometer, kmSince, daysSince, status };
  }).sort((a, b) => {
    const rank = { overdue: 0, soon: 1, ok: 2 };
    return rank[a.status] - rank[b.status] || a.service.localeCompare(b.service);
  });
}

export default function VehiclesTab({ isAdmin }: OpsProps) {
  useLang();
  const [data, setData] = useState<VehiclesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogsPayload | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logTab, setLogTab] = useState<LogTab>('fuel');

  const load = useCallback(async () => {
    try { setData(await api<VehiclesPayload>('/api/vehicles')); setError(null); }
    catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const action = useAction(load);

  const loadLogs = useCallback(async (id: number) => {
    setLogsLoading(true);
    try { setLogs(await api<LogsPayload>(`/api/vehicles?resource=logs&vehicle_id=${id}`)); }
    catch { setLogs({ fuel: [], maintenance: [] }); } finally { setLogsLoading(false); }
  }, []);

  useEffect(() => { if (selected) void loadLogs(selected); else setLogs(null); }, [selected, loadLogs]);

  const emptyV = { name: '', plate_number: '', vehicle_type: '', current_odometer: '0', is_active: true, notes: '' };
  const [vForm, setVForm] = useState<{ id: number | null } & typeof emptyV>({ id: null, ...emptyV });
  const [vErr, setVErr] = useState<FieldErrors>({});
  const [showV, setShowV] = useState(false);

  const saveVehicle = async (e: FormEvent) => {
    e.preventDefault();
    const result = validate(schemas.vehicle, vForm);
    if (!result.ok) { setVErr(result.errors); return; }
    setVErr({});
    const ok = await action.run('save-vehicle', () => api('/api/vehicles', { method: vForm.id ? 'PUT' : 'POST', body: { ...result.data, id: vForm.id ?? undefined } }));
    if (ok) { setShowV(false); setVForm({ id: null, ...emptyV }); }
  };

  const [fuel, setFuel] = useState({ filled_at: '', odometer: '', liters: '', price_total: '', station: '', notes: '' });
  const [fuelBill, setFuelBill] = useState<{ path: string; url: string } | null>(null);
  const [fuelErr, setFuelErr] = useState<FieldErrors>({});
  const [maint, setMaint] = useState({ serviced_at: '', odometer: '', service_type: '', price_total: '', vendor: '', notes: '' });
  const [maintBill, setMaintBill] = useState<{ path: string; url: string } | null>(null);
  const [maintErr, setMaintErr] = useState<FieldErrors>({});

  const addFuel = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const result = validate(schemas.vehicleFuel, { ...fuel, vehicle_id: selected, bill_path: fuelBill?.path ?? '', bill_url: fuelBill?.url ?? '' });
    if (!result.ok) { setFuelErr(result.errors); return; }
    setFuelErr({});
    const ok = await action.run('fuel', () => api('/api/vehicles?resource=fuel', { method: 'POST', body: result.data }));
    if (ok) { setFuel({ filled_at: '', odometer: '', liters: '', price_total: '', station: '', notes: '' }); setFuelBill(null); void load(); void loadLogs(selected); }
  };

  const addMaint = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const result = validate(schemas.vehicleMaintenance, { ...maint, vehicle_id: selected, bill_path: maintBill?.path ?? '', bill_url: maintBill?.url ?? '' });
    if (!result.ok) { setMaintErr(result.errors); return; }
    setMaintErr({});
    const ok = await action.run('maint', () => api('/api/vehicles?resource=maintenance', { method: 'POST', body: result.data }));
    if (ok) { setMaint({ serviced_at: '', odometer: '', service_type: '', price_total: '', vendor: '', notes: '' }); setMaintBill(null); void load(); void loadLogs(selected); }
  };

  const vehicles = data?.vehicles ?? [];
  const selectedVehicle = vehicles.find((v) => v.id === selected) ?? null;
  const reminders = useMemo(
    () => (logs && selectedVehicle ? buildReminders(logs.maintenance, Number(selectedVehicle.current_odometer) || 0) : []),
    [logs, selectedVehicle],
  );

  const exportFuel = () => {
    if (!logs?.fuel.length || !selectedVehicle) return;
    downloadCsv(
      `fuel-${selectedVehicle.plate_number}.csv`,
      [t('Date'), t('Odometer'), t('Liters'), t('Price (SAR)'), t('Station'), t('Notes'), t('Bill')],
      logs.fuel.map((l) => [formatDateTime(l.filled_at), l.odometer ?? '', l.liters ?? '', l.price_total, l.station ?? '', l.notes ?? '', l.bill_url ?? '']),
    );
  };

  const exportMaint = () => {
    if (!logs?.maintenance.length || !selectedVehicle) return;
    downloadCsv(
      `maintenance-${selectedVehicle.plate_number}.csv`,
      [t('Date'), t('Service type'), t('Odometer'), t('Price (SAR)'), t('Vendor / workshop'), t('Notes'), t('Bill')],
      logs.maintenance.map((l) => [formatDateTime(l.serviced_at), l.service_type, l.odometer ?? '', l.price_total, l.vendor ?? '', l.notes ?? '', l.bill_url ?? '']),
    );
  };

  const exportReminders = () => {
    if (!reminders.length || !selectedVehicle) return;
    const statusLabel = (s: Reminder['status']) => (s === 'overdue' ? t('Overdue') : s === 'soon' ? t('Due soon') : t('Up to date'));
    downloadCsv(
      `reminders-${selectedVehicle.plate_number}.csv`,
      [t('Service'), t('Last serviced'), t('Last odometer'), t('km since service'), t('Days since service'), t('Status')],
      reminders.map((r) => [r.service, r.lastDate ? formatDateTime(r.lastDate) : t('Never'), r.lastOdo ?? '', r.kmSince ?? '', r.daysSince ?? '', statusLabel(r.status)]),
    );
  };

  if (error) return <ErrorPanel message={error} onRetry={() => void load()} />;
  if (loading || !data) return <div className="space-y-4" role="status"><p className="sr-only">{t('Loading')}</p><div className="skeleton h-40 rounded-2xl" /><div className="skeleton h-40 rounded-2xl" /></div>;

  const tabs: { key: LogTab; label: string; icon: typeof Fuel }[] = [
    { key: 'fuel', label: t('Fuel log'), icon: Fuel },
    { key: 'maintenance', label: t('Maintenance log'), icon: Wrench },
    { key: 'reminders', label: t('Auto maintenance reminders'), icon: Bell },
  ];

  return (
    <div className="space-y-8">
      <TabIntro title={t('Vehicles')}>
        {t('Manage vehicles, fuel and maintenance logs, and approve movement requests.')}
      </TabIntro>
      <p className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-700">
        {t('Click a vehicle card in the Fleet list below, then record the fueling or maintenance.')}
      </p>

      {action.error && <Alert>{action.error}</Alert>}

      {isAdmin && (
        <div className="rounded-2xl border border-line bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl">{t('Fleet')}</h3>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => { setVForm({ id: null, ...emptyV }); setVErr({}); setShowV((v) => !v); }}>
              <Plus className="h-4 w-4" aria-hidden="true" />{t('Add vehicle')}
            </button>
          </div>
          {showV && (
            <form onSubmit={saveVehicle} noValidate className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <TextField id="v-name" label={t('Vehicle name')} required value={vForm.name} onChange={(e) => setVForm((f) => ({ ...f, name: e.target.value }))} error={vErr.name} />
              <TextField id="v-plate" label={t('Plate number')} required value={vForm.plate_number} onChange={(e) => setVForm((f) => ({ ...f, plate_number: e.target.value }))} error={vErr.plate_number} />
              <TextField id="v-type" label={t('Vehicle type')} value={vForm.vehicle_type} onChange={(e) => setVForm((f) => ({ ...f, vehicle_type: e.target.value }))} error={vErr.vehicle_type} />
              <TextField id="v-odo" label={t('Current odometer')} required inputMode="numeric" value={vForm.current_odometer} onChange={(e) => setVForm((f) => ({ ...f, current_odometer: e.target.value }))} error={vErr.current_odometer} />
              <label className="flex min-h-11 items-center gap-2 self-end pb-2 text-sm font-semibold">
                <input type="checkbox" checked={vForm.is_active} onChange={(e) => setVForm((f) => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 accent-primary" />
                {t('Active')}
              </label>
              <TextField id="v-notes" label={t('Notes')} value={vForm.notes} onChange={(e) => setVForm((f) => ({ ...f, notes: e.target.value }))} error={vErr.notes} />
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
                <button type="submit" className="btn btn-primary btn-sm" disabled={action.busy === 'save-vehicle'}>{action.busy === 'save-vehicle' ? <Spinner /> : <Check className="h-4 w-4" aria-hidden="true" />}{vForm.id ? t('Save') : t('Create vehicle')}</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowV(false)}>{t('Cancel')}</button>
              </div>
            </form>
          )}

          {vehicles.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t('No vehicles yet. Add one to assign it on deliveries.')}</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v) => (
                <li key={v.id} className={`rounded-xl border p-4 ${selected === v.id ? 'border-primary bg-mint/20' : 'border-line'}`}>
                  <button type="button" className="w-full text-start" onClick={() => { setSelected((s) => (s === v.id ? null : v.id)); setLogTab('fuel'); }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{v.name}</p>
                        <p className="text-sm text-muted"><span dir="ltr">{v.plate_number}</span>{v.vehicle_type ? ` · ${v.vehicle_type}` : ''}</p>
                      </div>
                      <Badge tone={v.is_active ? 'mint' : 'neutral'}>{v.is_active ? t('Active') : t('Inactive')}</Badge>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-sm"><Gauge className="h-4 w-4 text-primary" aria-hidden="true" /><span className="font-semibold tabular-nums" dir="ltr">{Number(v.current_odometer).toLocaleString()}</span> <span className="text-muted">{t('km')}</span></p>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-outline btn-xs" onClick={() => { setVForm({ id: v.id, name: v.name, plate_number: v.plate_number, vehicle_type: v.vehicle_type ?? '', current_odometer: String(v.current_odometer), is_active: v.is_active, notes: v.notes ?? '' }); setShowV(true); }}>{t('Edit')}</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selected && selectedVehicle && (
        <div className="rounded-2xl border border-line bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <h3 className="text-xl">{selectedVehicle.name}</h3>
              <p className="text-sm text-muted"><span dir="ltr">{selectedVehicle.plate_number}</span> · <span dir="ltr">{Number(selectedVehicle.current_odometer).toLocaleString()}</span> {t('km')}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label={t('Vehicle records')}>
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={logTab === key}
                onClick={() => setLogTab(key)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors ${logTab === key ? 'bg-mint/30 text-ink' : 'bg-paper-deep/40 text-muted hover:text-ink'}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="text-center">{label}</span>
              </button>
            ))}
          </div>

          <div className="mt-5">
            {logTab === 'fuel' && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold">{t('Fuel log')}</h4>
                  <button type="button" className="btn btn-outline btn-sm" onClick={exportFuel} disabled={!logs?.fuel.length}>
                    <Download className="h-4 w-4" aria-hidden="true" />{t('Export CSV')}
                  </button>
                </div>
                <form onSubmit={addFuel} noValidate className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <TextField id="f-date" label={t('Date & time')} type="datetime-local" value={fuel.filled_at} onChange={(e) => setFuel((f) => ({ ...f, filled_at: e.target.value }))} error={fuelErr.filled_at} />
                  <TextField id="f-odo" label={t('Odometer')} inputMode="numeric" value={fuel.odometer} onChange={(e) => setFuel((f) => ({ ...f, odometer: e.target.value }))} error={fuelErr.odometer} />
                  <TextField id="f-lit" label={t('Liters')} inputMode="decimal" value={fuel.liters} onChange={(e) => setFuel((f) => ({ ...f, liters: e.target.value }))} error={fuelErr.liters} />
                  <TextField id="f-price" label={t('Total price (SAR)')} required inputMode="decimal" value={fuel.price_total} onChange={(e) => setFuel((f) => ({ ...f, price_total: e.target.value }))} error={fuelErr.price_total} />
                  <TextField id="f-station" label={t('Station')} value={fuel.station} onChange={(e) => setFuel((f) => ({ ...f, station: e.target.value }))} error={fuelErr.station} />
                  <TextField id="f-notes" label={t('Notes')} value={fuel.notes} onChange={(e) => setFuel((f) => ({ ...f, notes: e.target.value }))} error={fuelErr.notes} />
                  <div className="sm:col-span-2 lg:col-span-3"><BillUpload label={t('Fuel bill / receipt')} value={fuelBill} onChange={setFuelBill} /></div>
                  <div className="sm:col-span-2 lg:col-span-3"><button type="submit" className="btn btn-primary btn-sm" disabled={action.busy === 'fuel'}>{action.busy === 'fuel' ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden="true" />}{t('Add fueling record')}</button></div>
                </form>
                <div className="mt-5 border-t border-line pt-4">
                  {logsLoading ? <p className="text-sm text-muted">{t('Loading…')}</p> : (logs?.fuel.length ? (
                    <ul className="space-y-2">{logs.fuel.map((l) => (
                      <li key={l.id} className="rounded-lg bg-paper-deep/50 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{sar(l.price_total)}</span><span className="text-muted">{formatDateTime(l.filled_at)}</span></div>
                        <p className="text-muted">{[l.station, l.liters != null ? `${l.liters} ${t('L')}` : null, l.odometer != null ? `${l.odometer} ${t('km')}` : null].filter(Boolean).join(' · ') || '—'}</p>
                        {l.bill_url && <a href={l.bill_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary-strong hover:underline">{t('View bill')}</a>}
                      </li>
                    ))}</ul>
                  ) : <p className="text-sm text-muted">{t('No fueling records yet.')}</p>)}
                </div>
              </div>
            )}

            {logTab === 'maintenance' && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-lg font-semibold">{t('Maintenance log')}</h4>
                  <button type="button" className="btn btn-outline btn-sm" onClick={exportMaint} disabled={!logs?.maintenance.length}>
                    <Download className="h-4 w-4" aria-hidden="true" />{t('Export CSV')}
                  </button>
                </div>
                <form onSubmit={addMaint} noValidate className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <TextField id="m-date" label={t('Date & time')} type="datetime-local" value={maint.serviced_at} onChange={(e) => setMaint((f) => ({ ...f, serviced_at: e.target.value }))} error={maintErr.serviced_at} />
                  <TextField id="m-odo" label={t('Odometer')} inputMode="numeric" value={maint.odometer} onChange={(e) => setMaint((f) => ({ ...f, odometer: e.target.value }))} error={maintErr.odometer} />
                  <TextField id="m-type" label={t('Service type')} required value={maint.service_type} onChange={(e) => setMaint((f) => ({ ...f, service_type: e.target.value }))} error={maintErr.service_type} placeholder={t('e.g. Oil change, tires')} />
                  <TextField id="m-price" label={t('Total price (SAR)')} required inputMode="decimal" value={maint.price_total} onChange={(e) => setMaint((f) => ({ ...f, price_total: e.target.value }))} error={maintErr.price_total} />
                  <TextField id="m-vendor" label={t('Vendor / workshop')} value={maint.vendor} onChange={(e) => setMaint((f) => ({ ...f, vendor: e.target.value }))} error={maintErr.vendor} />
                  <TextField id="m-notes" label={t('Notes')} value={maint.notes} onChange={(e) => setMaint((f) => ({ ...f, notes: e.target.value }))} error={maintErr.notes} />
                  <div className="sm:col-span-2 lg:col-span-3"><BillUpload label={t('Maintenance bill / receipt')} value={maintBill} onChange={setMaintBill} /></div>
                  <div className="sm:col-span-2 lg:col-span-3"><button type="submit" className="btn btn-primary btn-sm" disabled={action.busy === 'maint'}>{action.busy === 'maint' ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden="true" />}{t('Add maintenance record')}</button></div>
                </form>
                <div className="mt-5 border-t border-line pt-4">
                  {logsLoading ? <p className="text-sm text-muted">{t('Loading…')}</p> : (logs?.maintenance.length ? (
                    <ul className="space-y-2">{logs.maintenance.map((l) => (
                      <li key={l.id} className="rounded-lg bg-paper-deep/50 px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{l.service_type} · {sar(l.price_total)}</span><span className="text-muted">{formatDateTime(l.serviced_at)}</span></div>
                        <p className="text-muted">{[l.vendor, l.odometer != null ? `${l.odometer} ${t('km')}` : null].filter(Boolean).join(' · ') || '—'}</p>
                        {l.bill_url && <a href={l.bill_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary-strong hover:underline">{t('View bill')}</a>}
                      </li>
                    ))}</ul>
                  ) : <p className="text-sm text-muted">{t('No maintenance records yet.')}</p>)}
                </div>
              </div>
            )}

            {logTab === 'reminders' && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-semibold">{t('Auto maintenance reminders')}</h4>
                    <p className="mt-1 text-sm text-muted">{t('Based on last maintenance per service type (due soon: 6 months or 5,000 km, overdue: 12 months or 10,000 km).')}</p>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm" onClick={exportReminders} disabled={!reminders.length}>
                    <Download className="h-4 w-4" aria-hidden="true" />{t('Export CSV')}
                  </button>
                </div>
                <div className="mt-4">
                  {logsLoading ? <p className="text-sm text-muted">{t('Loading…')}</p> : reminders.length === 0 ? (
                    <p className="text-sm text-muted">{t('No maintenance history to generate reminders. Add maintenance records to see automatic reminders.')}</p>
                  ) : (
                    <ul className="space-y-2">
                      {reminders.map((r) => (
                        <li key={r.service} className="rounded-lg bg-paper-deep/50 px-3 py-3 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold">{r.service}</span>
                            <Badge tone={r.status === 'overdue' ? 'danger' : r.status === 'soon' ? 'brass' : 'mint'}>
                              {r.status === 'overdue' ? t('Overdue') : r.status === 'soon' ? t('Due soon') : t('Up to date')}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted">
                            {t('Last serviced')}: {r.lastDate ? formatDateTime(r.lastDate) : t('Never')}
                            {r.lastOdo != null ? <> · {t('Last odometer')}: <span dir="ltr">{r.lastOdo}</span> {t('km')}</> : null}
                          </p>
                          <p className="text-muted">
                            {t('km since service')}: <span dir="ltr">{r.kmSince != null ? r.kmSince.toLocaleString() : t('N/A')}</span>
                            {' · '}
                            {t('Days since service')}: <span dir="ltr">{r.daysSince != null ? r.daysSince.toLocaleString() : t('N/A')}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
