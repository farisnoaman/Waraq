import supabase from './db-client.js';
import { createHandler, HttpError, q, readBody, Reply } from './_lib/http.js';
import { getAuth, requireRole } from './_lib/auth.js';
import { schemas } from './_lib/schemas.js';
import { nowIso } from './_lib/workflow.js';

/**
 * Scheduled promotions, managed by an administrator. Buyers never touch this
 * route: the server applies the best eligible promotion when an order is
 * placed and snapshots it onto the order.
 */
function present(row) {
  const now = Date.now();
  let status;
  if (!row.is_active) status = 'inactive';
  else if (new Date(row.starts_at).getTime() > now) status = 'scheduled';
  else if (new Date(row.expires_at).getTime() >= now) status = 'running';
  else status = 'expired';
  return { ...row, status };
}

async function loadRow(id) {
  const row = await q(supabase.from('promotions').select('*').eq('id', id).maybeSingle());
  if (!row) throw new HttpError(404, 'That promotion could not be found.');
  return row;
}

export default createHandler({
  async GET(req) {
    requireRole(await getAuth(req), 'admin');
    const rows = await q(
      supabase.from('promotions').select('*').order('created_at', { ascending: false }),
    );
    return rows.map(present);
  },

  async POST(req) {
    requireRole(await getAuth(req), 'admin');
    const input = schemas.promotion.parse(readBody(req));
    if (input.discount_type === 'percentage' && input.discount_value > 100) {
      throw new HttpError(400, 'A percentage discount cannot be more than 100.', {
        discount_value: 'Use a percentage between 0 and 100.',
      });
    }
    const row = await q(
      supabase
        .from('promotions')
        .insert({
          name: input.name,
          description: input.description || null,
          discount_type: input.discount_type,
          discount_value: input.discount_value,
          threshold_type: input.threshold_type,
          threshold_value: input.threshold_value,
          starts_at: new Date(input.starts_at).toISOString(),
          expires_at: new Date(input.expires_at).toISOString(),
          is_active: true,
          created_at: nowIso(),
          updated_at: nowIso(),
        })
        .select()
        .single(),
    );
    return new Reply(201, present(row));
  },

  async PUT(req) {
    requireRole(await getAuth(req), 'admin');
    const body = readBody(req);
    const id = schemas.id.parse(body.id);

    // Activate / deactivate. Reactivating may carry a new expiry so a
    // lapsed promotion can run again — that moves it back to the Active tab.
    if (body.action === 'activate' || body.action === 'deactivate') {
      const row = await loadRow(id);
      const patch = { is_active: body.action === 'activate', updated_at: nowIso() };
      if (body.action === 'activate' && body.expires_at != null && body.expires_at !== '') {
        const expires = new Date(String(body.expires_at));
        if (Number.isNaN(expires.getTime())) {
          throw new HttpError(400, 'Enter a valid expiry date and time.', {
            expires_at: 'Enter a valid date and time.',
          });
        }
        if (expires <= new Date(row.starts_at)) {
          throw new HttpError(400, 'The expiry must be after the start.', {
            expires_at: 'The expiry must be after the start.',
          });
        }
        patch.expires_at = expires.toISOString();
      }
      const updated = await q(
        supabase.from('promotions').update(patch).eq('id', id).select().single(),
      );
      return present(updated);
    }

    const current = await loadRow(id);
    const input = schemas.promotion.parse(body);
    if (input.discount_type === 'percentage' && input.discount_value > 100) {
      throw new HttpError(400, 'A percentage discount cannot be more than 100.', {
        discount_value: 'Use a percentage between 0 and 100.',
      });
    }
    const updated = await q(
      supabase
        .from('promotions')
        .update({
          name: input.name,
          description: input.description || null,
          discount_type: input.discount_type,
          discount_value: input.discount_value,
          threshold_type: input.threshold_type,
          threshold_value: input.threshold_value,
          starts_at: new Date(input.starts_at).toISOString(),
          expires_at: new Date(input.expires_at).toISOString(),
          updated_at: nowIso(),
        })
        .eq('id', id)
        .select()
        .single(),
    );
    // Editing fields can flip the computed status; keep is_active untouched.
    return present({ ...updated, is_active: current.is_active });
  },

  async DELETE(req) {
    requireRole(await getAuth(req), 'admin');
    const id = schemas.id.parse(readBody(req).id);
    await q(supabase.from('promotions').delete().eq('id', id));
    return { ok: true };
  },
});
