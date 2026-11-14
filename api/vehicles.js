import supabase from './db-client.js';
import { createHandler, HttpError, q, readBody, Reply } from './_lib/http.js';
import { getAuth, getAuthUser, requireRole, displayName } from './_lib/auth.js';
import { schemas } from './_lib/schemas.js';
import { nowIso } from './_lib/workflow.js';

async function withRequester(rows) {
  if (!rows.length) return rows;
  const ids = [...new Set(rows.map((r) => r.requested_by).filter(Boolean))];
  const profiles = ids.length ? await q(supabase.from('profiles').select('id, full_name').in('id', ids)) : [];
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name]));
  return rows.map((r) => ({ ...r, requester_name: nameById.get(r.requested_by) ?? null }));
}

async function listVehicles(auth) {
  requireRole(auth, 'admin', 'staff');
  const [vehicles, movements] = await Promise.all([
    q(supabase.from('vehicles').select('*').order('is_active', { ascending: false }).order('name')),
    q(supabase.from('vehicle_movement_requests').select('*, vehicles(name, plate_number)').order('created_at', { ascending: false }).limit(200)),
  ]);
  const enriched = await withRequester(movements);
  const normalized = enriched.map((m) => ({
    ...m,
    vehicle_name: m.vehicles?.name ?? null,
    vehicle_plate: m.vehicles?.plate_number ?? null,
    vehicles: undefined,
  }));
  // staff see only their own requests in the list? keep full for admin, own for staff
  const filtered = auth.role === 'admin' ? normalized : normalized.filter((m) => m.requested_by === auth.profile.id);
  return { vehicles, movements: filtered };
}

async function upsertVehicle(body, auth) {
  requireRole(auth, 'admin');
  const input = schemas.vehicle.parse(body);
  const now = nowIso();
  const payload = {
    name: input.name,
    plate_number: input.plate_number.toUpperCase(),
    vehicle_type: input.vehicle_type || null,
    current_odometer: Number(input.current_odometer) || 0,
    is_active: input.is_active !== false,
    notes: input.notes || null,
    updated_at: now,
  };
  if (body.id) {
    const id = schemas.id.parse(body.id);
    const row = await q(supabase.from('vehicles').update(payload).eq('id', id).select().single());
    return row;
  }
  const row = await q(supabase.from('vehicles').insert({ ...payload, created_at: now }).select().single());
  return new Reply(201, row);
}

async function deleteVehicle(body, auth) {
  requireRole(auth, 'admin');
  const id = schemas.id.parse(body.id);
  await q(supabase.from('vehicles').delete().eq('id', id));
  return { ok: true };
}

async function listLogs(req, auth) {
  requireRole(auth, 'admin', 'staff');
  const vehicleId = schemas.id.parse(req.query.vehicle_id);
  const [fuel, maintenance] = await Promise.all([
    q(supabase.from('vehicle_fuel_logs').select('*').eq('vehicle_id', vehicleId).order('filled_at', { ascending: false }).limit(200)),
    q(supabase.from('vehicle_maintenance_logs').select('*').eq('vehicle_id', vehicleId).order('serviced_at', { ascending: false }).limit(200)),
  ]);
  return { fuel, maintenance };
}

async function addFuelLog(body, auth) {
  requireRole(auth, 'admin', 'staff');
  const input = schemas.vehicleFuel.parse(body);
  const row = await q(supabase.from('vehicle_fuel_logs').insert({
    vehicle_id: input.vehicle_id,
    filled_at: input.filled_at ? new Date(input.filled_at).toISOString() : nowIso(),
    odometer: input.odometer ?? null,
    liters: input.liters ?? null,
    price_total: Number(input.price_total) || 0,
    station: input.station || null,
    notes: input.notes || null,
    bill_path: input.bill_path || null,
    bill_url: input.bill_url || null,
    created_by: auth.profile.id,
    created_at: nowIso(),
  }).select().single());
  // advance odometer if higher
  if (input.odometer != null) {
    await q(supabase.from('vehicles').update({ current_odometer: input.odometer, updated_at: nowIso() }).eq('id', input.vehicle_id).lt('current_odometer', input.odometer));
  }
  return new Reply(201, row);
}

async function addMaintenanceLog(body, auth) {
  requireRole(auth, 'admin', 'staff');
  const input = schemas.vehicleMaintenance.parse(body);
  const row = await q(supabase.from('vehicle_maintenance_logs').insert({
    vehicle_id: input.vehicle_id,
    serviced_at: input.serviced_at ? new Date(input.serviced_at).toISOString() : nowIso(),
    odometer: input.odometer ?? null,
    service_type: input.service_type,
    price_total: Number(input.price_total) || 0,
    vendor: input.vendor || null,
    notes: input.notes || null,
    bill_path: input.bill_path || null,
    bill_url: input.bill_url || null,
    created_by: auth.profile.id,
    created_at: nowIso(),
  }).select().single());
  if (input.odometer != null) {
    await q(supabase.from('vehicles').update({ current_odometer: input.odometer, updated_at: nowIso() }).eq('id', input.vehicle_id).lt('current_odometer', input.odometer));
  }
  return new Reply(201, row);
}

async function createMovement(body, auth) {
  requireRole(auth, 'admin', 'staff');
  const input = schemas.movementRequest.parse(body);
  const vehicle = await q(supabase.from('vehicles').select('*').eq('id', input.vehicle_id).maybeSingle());
  if (!vehicle) throw new HttpError(404, 'That vehicle could not be found.');
  const row = await q(supabase.from('vehicle_movement_requests').insert({
    vehicle_id: input.vehicle_id,
    requested_by: auth.profile.id,
    reason: input.reason,
    status: 'pending',
    departure_odometer: input.departure_odometer ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }).select().single());
  return new Reply(201, row);
}

async function decideMovement(body, auth) {
  const input = schemas.movementDecision.parse(body);
  const reqRow = await q(supabase.from('vehicle_movement_requests').select('*').eq('id', input.id).maybeSingle());
  if (!reqRow) throw new HttpError(404, 'That request could not be found.');
  const now = nowIso();

  if (input.action === 'approve' || input.action === 'reject') {
    requireRole(auth, 'admin');
    if (reqRow.status !== 'pending') throw new HttpError(409, 'This request has already been processed.');
    if (input.action === 'approve') {
      await q(supabase.from('vehicle_movement_requests').update({
        status: 'approved', approved_by: auth.profile.id, approved_at: now, updated_at: now,
      }).eq('id', reqRow.id).eq('status', 'pending'));
    } else {
      await q(supabase.from('vehicle_movement_requests').update({
        status: 'rejected', approved_by: auth.profile.id, approved_at: now, rejected_reason: input.rejected_reason || null, updated_at: now,
      }).eq('id', reqRow.id).eq('status', 'pending'));
    }
    return { ok: true };
  }

  if (input.action === 'complete') {
    // staff returns: only requester or admin; must be approved
    if (auth.role !== 'admin' && reqRow.requested_by !== auth.profile.id) {
      throw new HttpError(403, 'Only the requester or an administrator can complete this request.');
    }
    if (reqRow.status !== 'approved') throw new HttpError(409, 'Only an approved request can be completed.');
    const ret = input.return_odometer == null ? null : Number(input.return_odometer);
    await q(supabase.from('vehicle_movement_requests').update({
      status: 'completed', return_odometer: ret, returned_at: now, updated_at: now,
    }).eq('id', reqRow.id).eq('status', 'approved'));
    if (ret != null) {
      await q(supabase.from('vehicles').update({ current_odometer: ret, updated_at: now }).eq('id', reqRow.vehicle_id).lt('current_odometer', ret));
    }
    return { ok: true };
  }

  if (input.action === 'cancel') {
    if (auth.role !== 'admin' && reqRow.requested_by !== auth.profile.id) {
      throw new HttpError(403, 'Not allowed.');
    }
    if (!['pending', 'approved'].includes(reqRow.status)) throw new HttpError(409, 'This request cannot be cancelled.');
    await q(supabase.from('vehicle_movement_requests').update({ status: 'cancelled', updated_at: now }).eq('id', reqRow.id));
    return { ok: true };
  }

  throw new HttpError(400, 'Unknown action.');
}

export default createHandler({
  async GET(req) {
    const auth = await getAuth(req);
    const resource = String(req.query.resource || 'vehicles');
    if (resource === 'logs') return listLogs(req, auth);
    return listVehicles(auth);
  },
  async POST(req) {
    const auth = await getAuth(req);
    const resource = String(req.query.resource || 'vehicles');
    const body = readBody(req);
    if (resource === 'fuel') return addFuelLog(body, auth);
    if (resource === 'maintenance') return addMaintenanceLog(body, auth);
    if (resource === 'movement') return createMovement(body, auth);
    return upsertVehicle(body, auth);
  },
  async PUT(req) {
    const auth = await getAuth(req);
    const resource = String(req.query.resource || 'vehicles');
    const body = readBody(req);
    if (resource === 'movement') return decideMovement(body, auth);
    return upsertVehicle(body, auth);
  },
  async DELETE(req) {
    const auth = await getAuth(req);
    const body = readBody(req);
    return deleteVehicle(body, auth);
  },
});
