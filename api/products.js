import supabase from './db-client.js';
import { createHandler, HttpError, q, readBody, Reply } from './_lib/http.js';
import { getAuth, requireRole } from './_lib/auth.js';
import { schemas } from './_lib/schemas.js';
import { getSettings, round2 } from './_lib/workflow.js';

function slugify(value) {
  return (
    String(value)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'product'
  );
}

/**
 * Adds category slugs and the effective VAT (own rate, or the default from
 * Settings). Fields are picked explicitly so `cost_price` can never leak to a
 * non-admin caller, whatever columns exist on the table.
 */
function present(product, categoryById, defaultVat, includeCost = false) {
  const unit = round2(product.unit_price);
  const override = product.vat_rate == null ? null : Number(product.vat_rate);
  const rate = override == null ? defaultVat : override;
  const vatValue = round2((unit * rate) / 100);
  const out = {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    category_id: product.category_id,
    project_category_id: product.project_category_id ?? null,
    summary: product.summary ?? '',
    description: product.description ?? null,
    specs: Array.isArray(product.specs) ? product.specs : [],
    pack_unit: product.pack_unit,
    min_order: product.min_order ?? null,
    moq: Math.max(1, Number(product.moq) || 1),
    unit_price: unit,
    vat_rate_override: override,
    vat_rate: rate,
    vat_value: vatValue,
    price_incl_vat: round2(unit + vatValue),
    in_stock: product.in_stock,
    featured: product.featured,
    image: product.image,
    created_at: product.created_at,
    category_slug: categoryById.get(product.category_id)?.slug ?? '',
    project_category_slug: product.project_category_id
      ? (categoryById.get(product.project_category_id)?.slug ?? null)
      : null,
    units_per_carton: product.units_per_carton ?? null,
    carton_price: product.carton_price == null ? null : round2(product.carton_price),
    min_sell_price: product.min_sell_price == null ? null : round2(product.min_sell_price),
    price_effective_from: product.price_effective_from ?? null,
  };
  if (includeCost) {
    out.cost_price = product.cost_price == null ? null : round2(product.cost_price);
  }
  return out;
}

/** Public callers stay anonymous; a valid admin token unlocks cost_price. */
async function optionalRole(req) {
  try {
    return (await getAuth(req)).role;
  } catch {
    return null;
  }
}

async function loadContext() {
  const [categories, settings] = await Promise.all([
    q(supabase.from('categories').select('*')),
    getSettings(),
  ]);
  return { categoryById: new Map(categories.map((c) => [c.id, c])), settings };
}

function checkCategories(input, categoryById) {
  const main = categoryById.get(input.category_id);
  if (!main || main.kind !== 'product') {
    throw new HttpError(400, 'Choose a product category.', {
      category_id: 'Choose a product category.',
    });
  }
  if (input.project_category_id != null) {
    const project = categoryById.get(input.project_category_id);
    if (!project || project.kind !== 'project') {
      throw new HttpError(400, 'Choose a valid project category.', {
        project_category_id: 'Choose a valid project category.',
      });
    }
  }
}

async function checkUnique(input, ignoreId) {
  const rows = await q(supabase.from('products').select('id, slug, sku'));
  const others = rows.filter((r) => r.id !== ignoreId);
  if (others.some((r) => String(r.sku).toUpperCase() === input.sku)) {
    throw new HttpError(409, 'Another product already uses this SKU.', {
      sku: 'Another product already uses this SKU.',
    });
  }
  const taken = new Set(others.map((r) => r.slug));
  const base = slugify(input.name);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export default createHandler({
  async GET(req) {
    const role = await optionalRole(req);
    const includeCost = role === 'admin';
    const [products, context] = await Promise.all([
      q(supabase.from('products').select('*').order('id', { ascending: true })),
      loadContext(),
    ]);
    return products.map((p) => present(p, context.categoryById, context.settings.vat_rate, includeCost));
  },

  async POST(req) {
    requireRole(await getAuth(req), 'admin');
    const input = schemas.product.parse(readBody(req));
    const context = await loadContext();
    checkCategories(input, context.categoryById);
    const slug = await checkUnique(input, null);
    const row = await q(
      supabase
        .from('products')
        .insert({
          ...input,
          min_order: input.min_order || `${input.moq} × ${input.pack_unit}`,
          unit_price: round2(input.unit_price),
          slug,
          created_at: new Date().toISOString(),
        })
        .select()
        .single(),
    );
    return new Reply(201, present(row, context.categoryById, context.settings.vat_rate, true));
  },

  async PUT(req) {
    requireRole(await getAuth(req), 'admin');
    const body = readBody(req);
    const context = await loadContext();

    // Settings tab: price and VAT only.
    if (body.mode === 'pricing') {
      const input = schemas.productPricing.parse(body);
      const rows = await q(
        supabase
          .from('products')
          .update({ unit_price: round2(input.unit_price), vat_rate: input.vat_rate })
          .eq('id', input.id)
          .select(),
      );
      if (!rows.length) throw new HttpError(404, 'That product no longer exists.');
      return present(rows[0], context.categoryById, context.settings.vat_rate, true);
    }

    // Settings tab: the photo on its own, after an upload.
    if (body.mode === 'image') {
      const id = schemas.id.parse(body.id);
      const image = schemas.imageAddress.parse(body.image);
      const rows = await q(
        supabase.from('products').update({ image }).eq('id', id).select(),
      );
      if (!rows.length) throw new HttpError(404, 'That product no longer exists.');
      return present(rows[0], context.categoryById, context.settings.vat_rate, true);
    }

    const id = schemas.id.parse(body.id);
    const input = schemas.product.parse(body);
    checkCategories(input, context.categoryById);
    const current = await q(supabase.from('products').select('*').eq('id', id).maybeSingle());
    if (!current) throw new HttpError(404, 'That product no longer exists.');
    const slug = await checkUnique(input, id);
    const row = await q(
      supabase
        .from('products')
        .update({
          ...input,
          min_order: input.min_order || `${input.moq} × ${input.pack_unit}`,
          unit_price: round2(input.unit_price),
          // Keep existing links working unless the name really changed.
          slug: current.name === input.name ? current.slug : slug,
        })
        .eq('id', id)
        .select()
        .single(),
    );
    return present(row, context.categoryById, context.settings.vat_rate, true);
  },

  async DELETE(req) {
    requireRole(await getAuth(req), 'admin');
    const id = schemas.id.parse(readBody(req).id);
    await q(supabase.from('products').delete().eq('id', id));
    return { ok: true };
  },
});
