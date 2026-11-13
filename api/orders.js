import supabase from './db-client.js';
import { createHandler, HttpError, q, readBody, Reply } from './_lib/http.js';
import { getAuth, requireRole } from './_lib/auth.js';
import { schemas } from './_lib/schemas.js';
import {
  ensureDraftDelivery,
  getSettings,
  hydrateOrders,
  nowIso,
  notify,
  notifyAdmins,
  round2,
} from './_lib/workflow.js';

async function loadOrder(id) {
  const order = await q(supabase.from('orders').select('*').eq('id', id).maybeSingle());
  if (!order) throw new HttpError(404, 'That order could not be found.');
  return order;
}

export default createHandler({
  /*
   * scope=mine -> the caller's own orders (buyer portal, any role).
   * otherwise  -> operations view: admins see everything, staff see only the
   *               orders whose delivery is assigned to them, buyers are refused.
   */
  async GET(req) {
    const auth = await getAuth(req);
    const mine = req.query.scope === 'mine';

    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);

    if (mine) {
      query = query.eq('buyer_id', auth.profile.id);
    } else if (auth.role === 'staff') {
      const assigned = await q(
        supabase.from('deliveries').select('order_id').eq('staff_id', auth.profile.id),
      );
      const ids = assigned.map((d) => d.order_id);
      if (!ids.length) return { orders: [], seller_vat_number: '' };
      query = query.in('id', ids);
    } else {
      requireRole(auth, 'admin');
    }

    const [orders, settings] = await Promise.all([q(query), getSettings()]);
    return {
      orders: await hydrateOrders(orders),
      seller_vat_number: settings.seller_vat_number,
    };
  },

  // Any signed-in user can place an order; it is always recorded against them.
  async POST(req) {
    const auth = await getAuth(req);
    const input = schemas.orderCreate.parse(readBody(req));

    const qtyByProduct = new Map();
    for (const line of input.items) {
      qtyByProduct.set(line.product_id, (qtyByProduct.get(line.product_id) ?? 0) + line.qty);
    }
    const productIds = [...qtyByProduct.keys()];

    const [products, settings] = await Promise.all([
      q(supabase.from('products').select('*').in('id', productIds)),
      getSettings(),
    ]);
    if (products.length !== productIds.length) {
      throw new HttpError(
        400,
        'One or more products are no longer in the catalogue. Review your list and try again.',
      );
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    // Prices, VAT and MOQ always come from the database, never from the browser.
    let subtotal = 0;
    let vatTotal = 0;
    let totalUnits = 0;
    const lines = productIds.map((productId) => {
      const product = productById.get(productId);
      const qty = qtyByProduct.get(productId);
      const moq = Math.max(1, Number(product.moq) || 1);
      if (qty < moq) {
        throw new HttpError(400, `${product.name}: the minimum order quantity is ${moq}.`);
      }
      if (qty > 9999) {
        throw new HttpError(400, `${product.name}: the quantity cannot be more than 9999.`);
      }
      const unitPrice = round2(product.unit_price);
      const vatRate = product.vat_rate == null ? settings.vat_rate : Number(product.vat_rate);
      const lineSubtotal = round2(unitPrice * qty);
      const lineVat = round2((lineSubtotal * vatRate) / 100);
      subtotal = round2(subtotal + lineSubtotal);
      vatTotal = round2(vatTotal + lineVat);
      totalUnits += qty;
      return {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        pack_unit: product.pack_unit,
        moq,
        qty,
        unit_price: unitPrice,
        vat_rate: vatRate,
        vat_per_item: round2((unitPrice * vatRate) / 100),
        line_subtotal: lineSubtotal,
        line_vat: lineVat,
        line_total: round2(lineSubtotal + lineVat),
      };
    });

    const now = nowIso();
    const order = await q(
      supabase
        .from('orders')
        .insert({
          reference: `WP-${Date.now().toString(36).toUpperCase()}`,
          buyer_id: auth.profile.id,
          buyer_name: input.name,
          buyer_email: auth.profile.email,
          buyer_company: input.company || null,
          buyer_phone: input.phone || null,
          city: input.city,
          address: input.address || null,
          notes: input.notes || null,
          status: 'pending',
          subtotal,
          vat_total: vatTotal,
          total: round2(subtotal + vatTotal),
          total_units: totalUnits,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single(),
    );

    try {
      await q(
        supabase.from('order_items').insert(lines.map((line) => ({ ...line, order_id: order.id }))),
      );
    } catch (err) {
      // No transaction available through the REST client: undo the header row.
      await supabase.from('orders').delete().eq('id', order.id);
      throw err;
    }

    const reference = `WP-${new Date().getFullYear()}-${String(order.id).padStart(5, '0')}`;
    const saved = await q(
      supabase.from('orders').update({ reference }).eq('id', order.id).select().single(),
    );

    // Keep the buyer's profile contact details fresh for next time.
    if (
      (input.company && !auth.profile.company) ||
      (input.phone && !auth.profile.phone)
    ) {
      await supabase
        .from('profiles')
        .update({
          company: auth.profile.company || input.company || null,
          phone: auth.profile.phone || input.phone || null,
        })
        .eq('id', auth.profile.id);
    }

    const [hydrated] = await hydrateOrders([saved]);

    await notifyAdmins({
      type: 'order_new',
      params: { buyer_name: saved.buyer_name, reference: saved.reference, total: round2(saved.total) },
      orderId: saved.id,
    });

    return new Reply(201, { order: hydrated, seller_vat_number: settings.seller_vat_number });
  },

  async PUT(req) {
    const auth = await getAuth(req);
    const body = readBody(req);
    const id = schemas.id.parse(body.id);
    const action = String(body.action || '');
    const order = await loadOrder(id);
    const now = nowIso();

    if (action === 'confirm') {
      requireRole(auth, 'admin');
      if (order.status !== 'pending') {
        throw new HttpError(409, 'Only a pending order can be confirmed.');
      }
      const rows = await q(
        supabase
          .from('orders')
          .update({ status: 'confirmed', updated_at: now })
          .eq('id', id)
          .eq('status', 'pending')
          .select(),
      );
      if (!rows.length) throw new HttpError(409, 'This order was already updated. Refresh to see it.');
      // Workflow automation: a confirmed order always gets a draft delivery.
      await ensureDraftDelivery(id);
      await notify({
        userId: order.buyer_id,
        type: 'order_confirmed',
        params: { reference: order.reference },
        orderId: id,
      });
    } else if (action === 'prepare') {
      requireRole(auth, 'admin');
      if (order.status !== 'confirmed') {
        throw new HttpError(409, 'Preparation can start once the order is confirmed.');
      }
      await q(
        supabase
          .from('orders')
          .update({ status: 'preparing', updated_at: now })
          .eq('id', id)
          .eq('status', 'confirmed'),
      );
    } else if (action === 'confirm_reception') {
      // Optional buyer-side confirmation. Only the buyer who owns the order.
      if (order.buyer_id !== auth.profile.id) {
        throw new HttpError(404, 'That order could not be found.');
      }
      const deliveries = await q(
        supabase.from('deliveries').select('*').eq('order_id', id).limit(1),
      );
      const delivery = deliveries[0];
      if (!delivery || !['dispatched', 'delivered'].includes(delivery.status)) {
        throw new HttpError(409, 'You can confirm reception once your order has been dispatched.');
      }
      if (!order.buyer_confirmed_at) {
        await q(
          supabase.from('orders').update({ buyer_confirmed_at: now, updated_at: now }).eq('id', id),
        );
        await q(
          supabase
            .from('deliveries')
            .update({ buyer_confirmed_at: now, updated_at: now })
            .eq('id', delivery.id),
        );
      }
    } else {
      throw new HttpError(400, 'Unknown order action.');
    }

    const [hydrated] = await hydrateOrders([await loadOrder(id)]);
    return hydrated;
  },
});
