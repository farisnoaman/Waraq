import supabase from '../db-client.js';
import { q } from './http.js';

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const nowIso = () => new Date().toISOString();

export async function getSettings() {
  const row = await q(supabase.from('settings').select('*').eq('id', 1).maybeSingle());
  return {
    vat_rate: Number(row?.vat_rate ?? 15),
    default_commission_rate: Number(row?.default_commission_rate ?? 2),
    // Falls back to the registered company number until the admin saves one in Settings.
    seller_vat_number: row?.seller_vat_number || '314635632800003',
  };
}

/*
 * The three "ensure" functions below are the workflow automations:
 *   order confirmed      -> draft delivery
 *   delivery delivered   -> payment record + staff commission
 * They are idempotent (check before insert), so calling them twice, or adding
 * equivalent database triggers later, never produces duplicates.
 */

export async function ensureDraftDelivery(orderId) {
  const existing = await q(
    supabase.from('deliveries').select('*').eq('order_id', orderId).limit(1),
  );
  if (existing.length) return existing[0];
  const now = nowIso();
  return q(
    supabase
      .from('deliveries')
      .insert({ order_id: orderId, status: 'draft', created_at: now, updated_at: now })
      .select()
      .single(),
  );
}

export async function ensurePayment(order, deliveryId) {
  const existing = await q(supabase.from('payments').select('*').eq('order_id', order.id).limit(1));
  if (existing.length) return existing[0];
  const now = nowIso();
  return q(
    supabase
      .from('payments')
      .insert({
        order_id: order.id,
        delivery_id: deliveryId,
        buyer_id: order.buyer_id,
        total_due: round2(order.total),
        total_paid: 0,
        status: 'unpaid',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single(),
  );
}

/**
 * Commission for the delivering staff member. Each order line earns the rate
 * of the highest tier whose MOQ threshold the product's MOQ reaches; lines
 * below every tier earn the default rate. Calculated on values excluding VAT.
 */
export async function ensureCommission(order, delivery) {
  if (!delivery?.staff_id) return null;
  const existing = await q(
    supabase.from('commissions').select('*').eq('order_id', order.id).limit(1),
  );
  if (existing.length) return existing[0];

  const [items, tiers, settings] = await Promise.all([
    q(supabase.from('order_items').select('*').eq('order_id', order.id).order('id')),
    q(supabase.from('commission_tiers').select('*')),
    getSettings(),
  ]);
  const sortedTiers = [...tiers].sort((a, b) => Number(b.min_moq) - Number(a.min_moq));

  let amount = 0;
  let base = 0;
  let highestMoq = 0;
  const labels = new Set();
  const breakdown = items.map((item) => {
    const moq = Math.max(1, Number(item.moq) || 1);
    const tier = sortedTiers.find((t) => moq >= Number(t.min_moq));
    const rate = tier ? Number(tier.rate) : settings.default_commission_rate;
    const label = tier ? tier.label : 'Default rate';
    const lineBase = round2(item.line_subtotal);
    const lineAmount = round2((lineBase * rate) / 100);
    amount = round2(amount + lineAmount);
    base = round2(base + lineBase);
    highestMoq = Math.max(highestMoq, moq);
    labels.add(label);
    return {
      product_name: item.product_name,
      sku: item.sku,
      moq,
      tier_label: label,
      rate,
      base: lineBase,
      amount: lineAmount,
    };
  });

  return q(
    supabase
      .from('commissions')
      .insert({
        order_id: order.id,
        delivery_id: delivery.id,
        staff_id: delivery.staff_id,
        moq_basis: highestMoq,
        tier_label: labels.size === 1 ? [...labels][0] : 'Mixed tiers',
        order_value: base,
        rate: base > 0 ? round2((amount / base) * 100) : 0,
        amount,
        breakdown,
        status: 'unpaid',
        created_at: nowIso(),
      })
      .select()
      .single(),
  );
}

/** Attaches items, delivery (with staff details) and payment (with installments). */
export async function hydrateOrders(orders) {
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);

  const [items, deliveries, payments] = await Promise.all([
    q(supabase.from('order_items').select('*').in('order_id', ids).order('id')),
    q(supabase.from('deliveries').select('*').in('order_id', ids)),
    q(supabase.from('payments').select('*').in('order_id', ids)),
  ]);

  const paymentIds = payments.map((p) => p.id);
  const staffIds = [...new Set(deliveries.map((d) => d.staff_id).filter(Boolean))];
  const [installments, staff] = await Promise.all([
    paymentIds.length
      ? q(
          supabase
            .from('payment_installments')
            .select('*')
            .in('payment_id', paymentIds)
            .order('created_at', { ascending: true }),
        )
      : [],
    staffIds.length
      ? q(supabase.from('profiles').select('id, full_name, email, phone').in('id', staffIds))
      : [],
  ]);

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const itemsByOrder = new Map();
  for (const item of items) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id).push(item);
  }
  const installmentsByPayment = new Map();
  for (const inst of installments) {
    if (!installmentsByPayment.has(inst.payment_id)) installmentsByPayment.set(inst.payment_id, []);
    installmentsByPayment.get(inst.payment_id).push(inst);
  }
  const deliveryByOrder = new Map(
    deliveries.map((d) => {
      const member = d.staff_id ? staffById.get(d.staff_id) : null;
      return [
        d.order_id,
        {
          ...d,
          staff_name: member?.full_name ?? null,
          staff_email: member?.email ?? null,
          staff_phone: member?.phone ?? null,
        },
      ];
    }),
  );
  const paymentByOrder = new Map(
    payments.map((p) => [p.order_id, { ...p, installments: installmentsByPayment.get(p.id) ?? [] }]),
  );

  return orders.map((order) => ({
    ...order,
    items: itemsByOrder.get(order.id) ?? [],
    delivery: deliveryByOrder.get(order.id) ?? null,
    payment: paymentByOrder.get(order.id) ?? null,
  }));
}

/* ---------------------------------------------------------------------
 * Notifications
 * ------------------------------------------------------------------- */

export async function notify({ userId, type, params = {}, orderId = null }) {
  if (!userId) return;
  try {
    await q(
      supabase.from('notifications').insert({
        user_id: userId,
        type,
        params,
        order_id: orderId,
      }),
    );
  } catch (err) {
    // Notifications are best effort: a missing table or a failed insert must
    // never take the order, delivery or payment it belongs to down with it.
    console.warn('[notify] could not create a notification:', err?.message);
  }
}

export async function adminUserIds() {
  const ids = new Set(
    String(process.env.WARAQ_ADMIN_USER_IDS || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );

  const { data } = await supabase.auth.admin.listUsers({ perPage: 100 });
  for (const user of data?.users ?? []) {
    if (user.app_metadata?.role === 'admin') ids.add(user.id);
  }
  return [...ids];
}

export async function notifyAdmins({ type, params = {}, orderId = null }) {
  const ids = await adminUserIds();
  for (const id of ids) {
    await notify({ userId: id, type, params, orderId });
  }
}

/** The order row, only the fields a notification needs. */
export async function orderSummary(id) {
  const order = await q(supabase.from('orders').select('*').eq('id', id).maybeSingle());
  return order;
}
