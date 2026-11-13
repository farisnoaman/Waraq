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

    // Group by product + unit type: the same product can be ordered both by
    // unit and by carton in one request, as separate lines.
    const qtyByKey = new Map();
    for (const line of input.items) {
      const key = `${line.product_id}:${line.unit_type}`;
      qtyByKey.set(key, (qtyByKey.get(key) ?? 0) + line.qty);
    }
    const productIds = [...new Set(input.items.map((line) => line.product_id))];

    const [products, settings, promotions] = await Promise.all([
      q(supabase.from('products').select('*').in('id', productIds)),
      getSettings(),
      q(supabase.from('promotions').select('*').eq('is_active', true)),
    ]);
    if (products.length !== productIds.length) {
      throw new HttpError(
        400,
        'One or more products are no longer in the catalogue. Review your list and try again.',
      );
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    // Prices, VAT and MOQ always come from the database, never from the
    // browser. A carton line is priced at the carton price and converted to
    // units for MOQ and quantity totals.
    let subtotal = 0;
    let vatTotal = 0;
    let totalUnits = 0;
    const totalCartons = { value: 0 };
    const lines = [...qtyByKey.entries()].map(([key, qty]) => {
      const separator = key.lastIndexOf(':');
      const productId = Number(key.slice(0, separator));
      const unitType = key.slice(separator + 1);
      const product = productById.get(productId);
      const moq = Math.max(1, Number(product.moq) || 1);
      const byCarton = unitType === 'carton';
      const unitsPerCarton = byCarton ? Math.max(1, Number(product.units_per_carton) || 0) : null;
      if (byCarton && (!unitsPerCarton || product.carton_price == null)) {
        throw new HttpError(400, `${product.name} is not sold by the carton.`);
      }
      const listUnitPrice = byCarton ? round2(product.carton_price) : round2(product.unit_price);
      const convertedUnits = byCarton ? qty * unitsPerCarton : qty;
      if (convertedUnits < moq) {
        throw new HttpError(400, `${product.name}: the minimum order quantity is ${moq} units.`);
      }
      if (qty > 9999) {
        throw new HttpError(400, `${product.name}: the quantity cannot be more than 9999.`);
      }
      const vatRate = product.vat_rate == null ? settings.vat_rate : Number(product.vat_rate);
      const lineSubtotal = round2(listUnitPrice * qty);
      const lineVat = round2((lineSubtotal * vatRate) / 100);
      subtotal = round2(subtotal + lineSubtotal);
      vatTotal = round2(vatTotal + lineVat);
      totalUnits += convertedUnits;
      if (byCarton) totalCartons.value += qty;
      return {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        pack_unit: product.pack_unit,
        moq,
        qty,
        unit_type: unitType,
        units_per_carton: unitsPerCarton,
        list_unit_price: listUnitPrice,
        // Charged price starts at the list price; only an administrator may
        // lower it later, never below the product's minimum sell price.
        unit_price: listUnitPrice,
        vat_rate: vatRate,
        vat_per_item: round2((listUnitPrice * vatRate) / 100),
        line_subtotal: lineSubtotal,
        line_vat: lineVat,
        line_total: round2(lineSubtotal + lineVat),
      };
    });

    // One promotion maximum: running now, threshold met, biggest discount.
    // The discount applies to the VAT-inclusive total.
    const nowMs = Date.parse(nowIso());
    let best = null;
    for (const promo of promotions) {
      if (Date.parse(promo.starts_at) > nowMs || Date.parse(promo.expires_at) < nowMs) continue;
      const met =
        promo.threshold_type === 'order_total'
          ? subtotal >= Number(promo.threshold_value)
          : promo.threshold_type === 'total_units'
            ? totalUnits >= Number(promo.threshold_value)
            : totalCartons.value >= Number(promo.threshold_value);
      if (!met) continue;
      const amount =
        promo.discount_type === 'percentage'
          ? round2((subtotal * Number(promo.discount_value)) / 100)
          : round2(Math.min(Number(promo.discount_value), round2(subtotal + vatTotal)));
      if (amount <= 0) continue;
      if (!best || amount > best.amount) best = { promo, amount };
    }
    const promotionDiscount = best ? Math.min(best.amount, round2(subtotal + vatTotal)) : 0;

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
          total: round2(Math.max(0, round2(subtotal + vatTotal) - promotionDiscount)),
          total_units: totalUnits,
          list_total: subtotal,
          discount_total: promotionDiscount,
          promotion_id: best?.promo.id ?? null,
          promotion_name: best?.promo.name ?? null,
          promotion_discount: promotionDiscount,
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
    } else if (action === 'set_item_price') {
      // Administrator negotiation on a pending order: the price may drop to
      // the product's minimum sell price (never below), never above list.
      requireRole(auth, 'admin');
      const priceInput = schemas.itemPrice.parse(body);
      if (order.status !== 'pending') {
        throw new HttpError(409, 'Prices can be adjusted only while the order is pending.');
      }
      const items = await q(supabase.from('order_items').select('*').eq('order_id', id).order('id'));
      const target = items.find((item) => item.id === priceInput.item_id);
      if (!target) throw new HttpError(404, 'That order line could not be found.');
      const listPrice = Number(target.list_unit_price) || Number(target.unit_price);
      let floor = listPrice;
      if (target.product_id) {
        const product = await q(
          supabase.from('products').select('min_sell_price').eq('id', target.product_id).maybeSingle(),
        );
        if (product?.min_sell_price != null) floor = Number(product.min_sell_price);
      }
      const newPrice = round2(priceInput.unit_price);
      if (newPrice > listPrice) {
        throw new HttpError(400, `The price cannot be above the list price of SAR ${listPrice.toFixed(2)}.`, {
          unit_price: `The list price is SAR ${listPrice.toFixed(2)}.`,
        });
      }
      if (newPrice < floor) {
        throw new HttpError(400, `The minimum sell price for this item is SAR ${floor.toFixed(2)}.`, {
          unit_price: `The minimum sell price is SAR ${floor.toFixed(2)}.`,
        });
      }
      const vatPerUnit = round2((newPrice * Number(target.vat_rate)) / 100);
      const lineSubtotal = round2(newPrice * Number(target.qty));
      const lineVat = round2(vatPerUnit * Number(target.qty));
      await q(
        supabase
          .from('order_items')
          .update({
            unit_price: newPrice,
            vat_per_item: vatPerUnit,
            line_subtotal: lineSubtotal,
            line_vat: lineVat,
            line_total: round2(lineSubtotal + lineVat),
          })
          .eq('id', target.id),
      );
      // Re-total the order from the table so concurrent edits cannot drift.
      const refreshed = await q(supabase.from('order_items').select('*').eq('order_id', id));
      const newSubtotal = round2(refreshed.reduce((sum, item) => sum + Number(item.line_subtotal), 0));
      const newVat = round2(refreshed.reduce((sum, item) => sum + Number(item.line_vat), 0));
      const newListTotal = round2(
        refreshed.reduce(
          (sum, item) =>
            sum + (Number(item.list_unit_price) || Number(item.unit_price)) * Number(item.qty),
          0,
        ),
      );
      const promotionDiscount = round2(Number(order.promotion_discount) || 0);
      const discountTotal = round2(Math.max(0, round2(newListTotal - newSubtotal)) + promotionDiscount);
      const newTotal = round2(Math.max(0, round2(newSubtotal + newVat) - promotionDiscount));
      await q(
        supabase
          .from('orders')
          .update({
            subtotal: newSubtotal,
            vat_total: newVat,
            total: newTotal,
            list_total: newListTotal,
            discount_total: discountTotal,
            updated_at: now,
          })
          .eq('id', id),
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
