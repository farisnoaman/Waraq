-- =============================================================================
-- Waraq Pro: unit/carton pricing, price list with a negotiation floor, and
-- scheduled promotions.
--
--   products  : cost price (admin-only), minimum sell price (negotiation
--               floor), carton packaging (units per carton + carton price),
--               price effective-from date (display metadata; no history in v1).
--   promotions: scheduled % / fixed-amount discounts unlocked by an order
--               threshold (total SAR, total units, or total cartons).
--   orders    : list total, discount total, and the applied promotion snapshot.
--   order_items: which unit the line was priced in, the list price at purchase
--               (so the bill can show the negotiated discount), and the carton
--               snapshot.
--
-- STATUS: run once in the Supabase SQL editor after 0003. Idempotent columns.
-- =============================================================================

begin;

-- 1. Product price list -------------------------------------------------------
alter table public.products
  add column if not exists units_per_carton integer,
  add column if not exists carton_price numeric,
  add column if not exists cost_price numeric,
  add column if not exists min_sell_price numeric,
  add column if not exists price_effective_from timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_units_per_carton_check') then
    alter table public.products
      add constraint products_units_per_carton_check check (units_per_carton is null or units_per_carton >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_carton_price_check') then
    alter table public.products
      add constraint products_carton_price_check check (carton_price is null or carton_price > 0);
  end if;
end $$;

-- 2. Promotions ---------------------------------------------------------------
create table if not exists public.promotions (
  id serial primary key,
  name text not null,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric not null check (discount_value > 0),
  -- Whole-order scope in v1. A per-product extension adds a nullable
  -- product_id references public.products(id) here.
  threshold_type text not null check (threshold_type in ('order_total', 'total_units', 'total_cartons')),
  threshold_value numeric not null check (threshold_value > 0),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_window_check check (expires_at > starts_at)
);

-- API-only (the service key bypasses RLS): buyers never read or write
-- promotions directly — the server applies them and snapshots the result on
-- the order.
alter table public.promotions enable row level security;

-- 3. Order-level discount snapshot --------------------------------------------
alter table public.orders
  add column if not exists list_total numeric not null default 0,
  add column if not exists discount_total numeric not null default 0,
  add column if not exists promotion_id integer,
  add column if not exists promotion_name text,
  add column if not exists promotion_discount numeric not null default 0;

-- 4. Line-level unit type + list price ----------------------------------------
alter table public.order_items
  add column if not exists unit_type text not null default 'unit',
  add column if not exists units_per_carton integer,
  add column if not exists list_unit_price numeric not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_items_unit_type_check') then
    alter table public.order_items
      add constraint order_items_unit_type_check check (unit_type in ('unit', 'carton'));
  end if;
end $$;

commit;
