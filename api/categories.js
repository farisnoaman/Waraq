import supabase from './db-client.js';
import { createHandler, HttpError, q, readBody, Reply } from './_lib/http.js';
import { getAuth, requireRole } from './_lib/auth.js';
import { schemas } from './_lib/schemas.js';

function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'category'
  );
}

async function uniqueSlug(base, ignoreId) {
  const rows = await q(supabase.from('categories').select('id, slug'));
  const taken = new Set(rows.filter((r) => r.id !== ignoreId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export default createHandler({
  async GET() {
    return q(
      supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true }),
    );
  },

  async POST(req) {
    requireRole(await getAuth(req), 'admin');
    const input = schemas.category.parse(readBody(req));
    const slug = await uniqueSlug(slugify(input.name));
    const row = await q(supabase.from('categories').insert({ ...input, slug }).select().single());
    return new Reply(201, row);
  },

  async PUT(req) {
    requireRole(await getAuth(req), 'admin');
    const body = readBody(req);
    const id = schemas.id.parse(body.id);
    const input = schemas.category.parse(body);
    const current = await q(supabase.from('categories').select('*').eq('id', id).maybeSingle());
    if (!current) throw new HttpError(404, 'That category no longer exists.');
    if (current.kind !== input.kind) {
      const column = current.kind === 'product' ? 'category_id' : 'project_category_id';
      const used = await q(supabase.from('products').select('id').eq(column, id).limit(1));
      if (used.length) {
        throw new HttpError(409, 'Products still use this category, so its type cannot change.', {
          kind: 'Move the products to another category first.',
        });
      }
    }
    return q(supabase.from('categories').update(input).eq('id', id).select().single());
  },

  async DELETE(req) {
    requireRole(await getAuth(req), 'admin');
    const id = schemas.id.parse(readBody(req).id);
    const [asMain, asProject] = await Promise.all([
      q(supabase.from('products').select('id').eq('category_id', id).limit(1)),
      q(supabase.from('products').select('id').eq('project_category_id', id).limit(1)),
    ]);
    if (asMain.length || asProject.length) {
      throw new HttpError(
        409,
        'Products still use this category. Move them to another category before deleting it.',
      );
    }
    await q(supabase.from('categories').delete().eq('id', id));
    return { ok: true };
  },
});
