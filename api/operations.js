import supabase from './db-client.js';
import { createHandler, HttpError, q, readBody, Reply } from './_lib/http.js';
import { displayName, getAuth, getAuthUser, requireRole, resolveRole } from './_lib/auth.js';
import { schemas } from './_lib/schemas.js';
import {
  ensureCommission,
  ensurePayment,
  getSettings,
  nowIso,
  round2,
} from './_lib/workflow.js';

/* ------------------------------------------------------------ deliveries */

async function loadDeliveryFor(auth, id) {
  const delivery = await q(supabase.from('deliveries').select('*').eq('id', id).maybeSingle());
  // Staff only ever "see" their own assignments; anything else is a 404 for them.
  if (!delivery || (auth.role === 'staff' && delivery.staff_id !== auth.profile.id)) {
    throw new HttpError(404, 'That delivery could not be found.');
  }
  return delivery;
}

async function updateDelivery(body, auth) {
  requireRole(auth, 'admin', 'staff');
  const action = String(body.action || '');
  const now = nowIso();

  if (action === 'assign') {
    requireRole(auth, 'admin');
    const input = schemas.assign.parse(body);
    const delivery = await loadDeliveryFor(auth, input.id);
    if (!['draft', 'assigned'].includes(delivery.status)) {
      throw new HttpError(409, 'This delivery has already been dispatched and cannot be reassigned.');
    }
    // The role is read from Supabase Auth, not from a table row.
    const staffUser = await getAuthUser(input.staff_id);
    if (!staffUser || resolveRole(staffUser) !== 'staff') {
      throw new HttpError(400, 'Choose an active staff member.', {
        staff_id: 'Choose an active staff member.',
      });
    }
    const changingStaff = delivery.staff_id !== input.staff_id;
    if (delivery.staff_accepted_at && changingStaff) {
      throw new HttpError(
        409,
        'The assigned staff member has already accepted this delivery, so it can no longer be given to someone else.',
      );
    }

    let update = supabase
      .from('deliveries')
      .update({
        staff_id: input.staff_id,
        vehicle_type: input.vehicle_type,
        vehicle_plate: input.vehicle_plate,
        status: 'assigned',
        assigned_at: changingStaff || !delivery.assigned_at ? now : delivery.assigned_at,
        updated_at: now,
      })
      .eq('id', delivery.id)
      .in('status', ['draft', 'assigned']);
    // Guards the race where the staff member accepts while the admin reassigns.
    if (changingStaff) update = update.is('staff_accepted_at', null);
    const rows = await q(update.select());
    if (!rows.length) {
      throw new HttpError(
        409,
        'This delivery was accepted or dispatched a moment ago, so the assignment was not changed.',
      );
    }
    await q(
      supabase
        .from('orders')
        .update({ status: 'under_processing', updated_at: now })
        .eq('id', delivery.order_id)
        .in('status', ['confirmed', 'preparing']),
    );
    return { ok: true };
  }

  const id = schemas.id.parse(body.id);
  const delivery = await loadDeliveryFor(auth, id);

  if (action === 'accept') {
    // Only the assigned staff member can accept; that is what locks reassignment.
    if (auth.role !== 'staff' || delivery.staff_id !== auth.profile.id) {
      throw new HttpError(403, 'Only the assigned staff member can accept this delivery.');
    }
    if (delivery.status !== 'assigned') {
      throw new HttpError(409, 'This delivery is not waiting for acceptance.');
    }
    if (!delivery.staff_accepted_at) {
      const rows = await q(
        supabase
          .from('deliveries')
          .update({ staff_accepted_at: now, updated_at: now })
          .eq('id', id)
          .eq('staff_id', auth.profile.id)
          .eq('status', 'assigned')
          .is('staff_accepted_at', null)
          .select(),
      );
      if (!rows.length) {
        throw new HttpError(409, 'This delivery was reassigned before you accepted it.');
      }
    }
    return { ok: true };
  }

  if (action === 'dispatch') {
    if (delivery.status !== 'assigned') {
      throw new HttpError(409, 'Only an assigned delivery can be dispatched.');
    }
    if (!delivery.staff_accepted_at) {
      throw new HttpError(409, 'The assigned staff member must accept the delivery before dispatch.');
    }
    const rows = await q(
      supabase
        .from('deliveries')
        .update({ status: 'dispatched', dispatched_at: now, updated_at: now })
        .eq('id', id)
        .eq('status', 'assigned')
        .select(),
    );
    if (!rows.length) throw new HttpError(409, 'This delivery was already updated.');
    await q(
      supabase
        .from('orders')
        .update({ status: 'in_delivery', updated_at: now })
        .eq('id', delivery.order_id)
        .in('status', ['confirmed', 'preparing', 'under_processing']),
    );
    return { ok: true };
  }

  if (action === 'deliver') {
    if (delivery.status !== 'dispatched') {
      throw new HttpError(409, 'Reception can be confirmed once the delivery has been dispatched.');
    }
    const rows = await q(
      supabase
        .from('deliveries')
        .update({
          status: 'delivered',
          delivered_at: now,
          staff_confirmed_at: now,
          updated_at: now,
        })
        .eq('id', id)
        .eq('status', 'dispatched')
        .select(),
    );
    if (!rows.length) throw new HttpError(409, 'This delivery was already updated.');
    const orders = await q(
      supabase
        .from('orders')
        .update({ status: 'delivered', updated_at: now })
        .eq('id', delivery.order_id)
        .select(),
    );
    // Workflow automations: a completed delivery creates the payment record
    // and the delivering staff member's commission.
    if (orders[0]) {
      await ensurePayment(orders[0], delivery.id);
      await ensureCommission(orders[0], rows[0]);
    }
    return { ok: true };
  }

  throw new HttpError(400, 'Unknown delivery action.');
}

/* -------------------------------------------------------------- payments */

async function newReceiptNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = `RCP-${stamp}-${Math.floor(100000 + Math.random() * 900000)}`;
    const clash = await q(
      supabase.from('payment_installments').select('id').eq('receipt_number', candidate).limit(1),
    );
    if (!clash.length) return candidate;
  }
  return `RCP-${stamp}-${Date.now().toString(36).toUpperCase()}`;
}

async function recordInstallment(body, auth) {
  requireRole(auth, 'admin', 'staff');
  const input = schemas.installment.parse(body);

  const payment = await q(
    supabase.from('payments').select('*').eq('id', input.payment_id).maybeSingle(),
  );
  if (!payment) throw new HttpError(404, 'That payment record could not be found.');
  if (auth.role === 'staff') {
    const own = await q(
      supabase
        .from('deliveries')
        .select('id')
        .eq('order_id', payment.order_id)
        .eq('staff_id', auth.profile.id)
        .limit(1),
    );
    if (!own.length) throw new HttpError(404, 'That payment record could not be found.');
  }

  const existing = await q(
    supabase.from('payment_installments').select('amount').eq('payment_id', payment.id),
  );
  const totalDue = round2(payment.total_due);
  const paidSoFar = round2(existing.reduce((sum, row) => sum + Number(row.amount), 0));
  const remaining = round2(totalDue - paidSoFar);
  if (remaining <= 0) throw new HttpError(409, 'This payment is already settled in full.');

  const amount = round2(input.amount);
  if (amount > remaining) {
    const message = `The amount is more than the remaining balance of SAR ${remaining.toFixed(2)}.`;
    throw new HttpError(400, message, { amount: message });
  }

  const now = nowIso();
  const installment = await q(
    supabase
      .from('payment_installments')
      .insert({
        payment_id: payment.id,
        receipt_number: await newReceiptNumber(),
        amount,
        balance_after: round2(remaining - amount),
        method: input.method,
        receiver_id: auth.profile.id,
        receiver_name: auth.profile.full_name,
        receiver_reference: input.receiver_reference || null,
        created_at: now,
      })
      .select()
      .single(),
  );

  // Re-total from the table so two simultaneous entries can never overpay.
  const all = await q(
    supabase.from('payment_installments').select('amount').eq('payment_id', payment.id),
  );
  const totalPaid = round2(all.reduce((sum, row) => sum + Number(row.amount), 0));
  if (totalPaid > totalDue) {
    await supabase.from('payment_installments').delete().eq('id', installment.id);
    throw new HttpError(409, 'Another payment was recorded at the same time. Refresh and try again.');
  }

  const settled = totalPaid >= totalDue;
  await q(
    supabase
      .from('payments')
      .update({ total_paid: totalPaid, status: settled ? 'paid' : 'partial', updated_at: now })
      .eq('id', payment.id),
  );
  if (settled) {
    await q(
      supabase
        .from('orders')
        .update({ status: 'completed', updated_at: now })
        .eq('id', payment.order_id)
        .eq('status', 'delivered'),
    );
  }
  return new Reply(201, installment);
}

/* ----------------------------------------------------------- commissions */

async function listCommissions(auth) {
  requireRole(auth, 'admin', 'staff');
  let query = supabase
    .from('commissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (auth.role === 'staff') query = query.eq('staff_id', auth.profile.id);
  const rows = await q(query);
  if (!rows.length) return [];

  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const staffIds = [...new Set(rows.map((r) => r.staff_id))];
  const [orders, staff] = await Promise.all([
    q(supabase.from('orders').select('id, reference, buyer_name').in('id', orderIds)),
    q(supabase.from('profiles').select('id, full_name, email').in('id', staffIds)),
  ]);
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const staffById = new Map(staff.map((s) => [s.id, s]));
  return rows.map((row) => ({
    ...row,
    breakdown: Array.isArray(row.breakdown) ? row.breakdown : [],
    order_reference: orderById.get(row.order_id)?.reference ?? `#${row.order_id}`,
    buyer_name: orderById.get(row.order_id)?.buyer_name ?? '',
    staff_name: staffById.get(row.staff_id)?.full_name ?? 'Former staff member',
    staff_email: staffById.get(row.staff_id)?.email ?? '',
  }));
}

async function updateCommission(body, auth) {
  requireRole(auth, 'admin', 'staff');
  const id = schemas.id.parse(body.id);
  const action = String(body.action || '');
  const commission = await q(supabase.from('commissions').select('*').eq('id', id).maybeSingle());
  if (!commission || (auth.role === 'staff' && commission.staff_id !== auth.profile.id)) {
    throw new HttpError(404, 'That commission record could not be found.');
  }
  const now = nowIso();

  if (action === 'pay') {
    // Admin says "I have paid this". It stays not-paid until the staff member confirms.
    requireRole(auth, 'admin');
    if (commission.status !== 'unpaid') {
      throw new HttpError(409, 'This commission is already awaiting confirmation or paid.');
    }
    await q(
      supabase
        .from('commissions')
        .update({ status: 'awaiting_confirmation', paid_marked_at: now, paid_by: auth.profile.id })
        .eq('id', id)
        .eq('status', 'unpaid'),
    );
    return { ok: true };
  }

  if (action === 'confirm' || action === 'reject') {
    if (auth.role !== 'staff' || commission.staff_id !== auth.profile.id) {
      throw new HttpError(403, 'Only the staff member who earned this commission can respond.');
    }
    if (commission.status !== 'awaiting_confirmation') {
      throw new HttpError(409, 'There is no payment waiting for your confirmation.');
    }
    const patch =
      action === 'confirm'
        ? { status: 'paid', confirmed_at: now }
        : { status: 'unpaid', paid_marked_at: null, paid_by: null };
    await q(
      supabase
        .from('commissions')
        .update(patch)
        .eq('id', id)
        .eq('status', 'awaiting_confirmation'),
    );
    return { ok: true };
  }

  throw new HttpError(400, 'Unknown commission action.');
}

/* ----------------------------------------------------------------- users */

/** Every account, with its role taken from Supabase Auth and contact details from profiles. */
async function loadUsers() {
  const accounts = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    accounts.push(...data.users);
    if (data.users.length < 200) break;
  }
  const profiles = await q(supabase.from('profiles').select('*').limit(2000));
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  return accounts
    .map((account) => {
      const profile = profileById.get(account.id);
      return {
        id: account.id,
        email: String(account.email || '').toLowerCase(),
        full_name: profile?.full_name || displayName(account),
        role: resolveRole(account),
        company: profile?.company ?? null,
        phone: profile?.phone ?? null,
        created_at: account.created_at,
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

async function listUsers(auth) {
  requireRole(auth, 'admin');
  return loadUsers();
}

async function listStaff(auth) {
  requireRole(auth, 'admin');
  const users = await loadUsers();
  return users
    .filter((user) => user.role === 'staff')
    .map(({ id, full_name, email, phone }) => ({ id, full_name, email, phone }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function createStaff(body, auth) {
  requireRole(auth, 'admin');
  const input = schemas.staffCreate.parse(body);

  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.full_name },
    app_metadata: { role: 'staff' },
  });
  if (error || !data?.user) {
    const duplicate = /already|registered|exists/i.test(error?.message || '');
    const message = duplicate
      ? 'An account with this email already exists. Find it in the list and assign it as staff.'
      : 'The staff account could not be created. Check the details and try again.';
    throw new HttpError(duplicate ? 409 : 400, message, duplicate ? { email: message } : undefined);
  }

  const profile = await q(
    supabase
      .from('profiles')
      .upsert({
        id: data.user.id,
        email: input.email,
        full_name: input.full_name,
        phone: input.phone || null,
        role: 'staff',
      })
      .select()
      .single(),
  );
  return new Reply(201, profile);
}

async function updateRole(body, auth) {
  requireRole(auth, 'admin');
  const input = schemas.roleUpdate.parse(body);
  if (input.id === auth.profile.id) {
    throw new HttpError(400, 'You cannot change your own role.');
  }
  const target = await getAuthUser(input.id);
  if (!target) throw new HttpError(404, 'That user could not be found.');
  const currentRole = resolveRole(target);
  if (currentRole === 'admin') {
    throw new HttpError(403, 'Administrator accounts cannot be changed here.');
  }
  if (currentRole === 'staff' && input.role === 'buyer') {
    const open = await q(
      supabase
        .from('deliveries')
        .select('id')
        .eq('staff_id', target.id)
        .in('status', ['assigned', 'dispatched'])
        .limit(1),
    );
    if (open.length) {
      throw new HttpError(
        409,
        'This staff member still has deliveries in progress. Complete or reassign them first.',
      );
    }
  }

  // The role lives in app_metadata, which only the service role can write.
  const { error } = await supabase.auth.admin.updateUserById(target.id, {
    app_metadata: { ...(target.app_metadata || {}), role: input.role },
  });
  if (error) throw error;

  await q(
    supabase.from('profiles').upsert({
      id: target.id,
      email: String(target.email || '').toLowerCase(),
      full_name: displayName(target),
      role: input.role,
    }, { onConflict: 'id', ignoreDuplicates: true }),
  );
  await q(supabase.from('profiles').update({ role: input.role }).eq('id', target.id));
  return { ok: true, id: target.id, role: input.role };
}

/* -------------------------------------------------------------- settings */

async function readSettings(auth) {
  requireRole(auth, 'admin');
  const [settings, tiers] = await Promise.all([
    getSettings(),
    q(supabase.from('commission_tiers').select('*').order('min_moq', { ascending: true })),
  ]);
  return { ...settings, tiers };
}

async function saveSettings(body, auth) {
  requireRole(auth, 'admin');
  const input = schemas.settings.parse(body);
  await q(
    supabase.from('settings').upsert({
      id: 1,
      vat_rate: input.vat_rate,
      default_commission_rate: input.default_commission_rate,
      seller_vat_number: input.seller_vat_number || null,
      updated_at: nowIso(),
    }),
  );
  return readSettings(auth);
}

async function createTier(body, auth) {
  requireRole(auth, 'admin');
  const input = schemas.tier.parse(body);
  const clash = await q(
    supabase.from('commission_tiers').select('id').eq('min_moq', input.min_moq).limit(1),
  );
  if (clash.length) {
    const message = 'A tier with this MOQ threshold already exists.';
    throw new HttpError(409, message, { min_moq: message });
  }
  const row = await q(
    supabase
      .from('commission_tiers')
      .insert({ ...input, created_at: nowIso() })
      .select()
      .single(),
  );
  return new Reply(201, row);
}

async function deleteTier(body, auth) {
  requireRole(auth, 'admin');
  const id = schemas.id.parse(body.id);
  await q(supabase.from('commission_tiers').delete().eq('id', id));
  return { ok: true };
}

/* -------------------------------------------------------------- messages */

async function listMessages(auth) {
  requireRole(auth, 'admin');
  return q(
    supabase
      .from('contact_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
  );
}

/* ---------------------------------------------------------------- router */

const ROUTES = {
  deliveries: { PUT: (req, auth) => updateDelivery(readBody(req), auth) },
  payments: { POST: (req, auth) => recordInstallment(readBody(req), auth) },
  commissions: {
    GET: (_req, auth) => listCommissions(auth),
    PUT: (req, auth) => updateCommission(readBody(req), auth),
  },
  users: {
    GET: (_req, auth) => listUsers(auth),
    POST: (req, auth) => createStaff(readBody(req), auth),
    PUT: (req, auth) => updateRole(readBody(req), auth),
  },
  staff: { GET: (_req, auth) => listStaff(auth) },
  settings: {
    GET: (_req, auth) => readSettings(auth),
    PUT: (req, auth) => saveSettings(readBody(req), auth),
  },
  tiers: {
    POST: (req, auth) => createTier(readBody(req), auth),
    DELETE: (req, auth) => deleteTier(readBody(req), auth),
  },
  messages: { GET: (_req, auth) => listMessages(auth) },
};

async function route(req) {
  const resource = String(req.query.resource || '');
  const table = Object.prototype.hasOwnProperty.call(ROUTES, resource) ? ROUTES[resource] : null;
  if (!table) throw new HttpError(404, 'Unknown resource.');
  const fn = table[req.method];
  if (!fn) throw new HttpError(405, 'Method not allowed');
  // Every operations resource requires a verified session; roles are checked per action.
  const auth = await getAuth(req);
  return fn(req, auth);
}

export default createHandler({ GET: route, POST: route, PUT: route, DELETE: route });
