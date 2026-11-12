-- =============================================================================
-- Waraq Pro: database hardening (role enum, triggers, enforced row level security)
--
-- STATUS: written for the schema this app uses, but NOT yet applied or tested.
-- The hosted preview database only accepts table/policy creation through its
-- tooling, so it could not run this file. Run it once in the SQL editor of the
-- Supabase project you take to production, after the tables exist.
--
-- The API already performs the same automations in code and checks before it
-- inserts, so applying these triggers does not create duplicate records.
-- =============================================================================

begin;

-- 1. Start from a clean slate: drop every policy on the app tables (including
--    any permissive "allow all" policy), so the ones below are the only rules.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profiles','categories','products','services','contact_messages','settings',
        'commission_tiers','orders','order_items','deliveries','payments',
        'payment_installments','commissions'])
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- 2. Roles as an enum, linked to auth.users.
create type public.user_role as enum ('buyer', 'admin', 'staff');

alter table public.profiles alter column role drop default;
alter table public.profiles
  alter column role type public.user_role using role::public.user_role;
alter table public.profiles alter column role set default 'buyer';
alter table public.profiles
  add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;

-- 3. Integrity constraints the API otherwise enforces in code.
alter table public.orders add constraint orders_status_check check (status in
  ('pending','confirmed','preparing','under_processing','in_delivery','delivered','completed'));
alter table public.deliveries add constraint deliveries_status_check check (status in
  ('draft','assigned','dispatched','delivered'));
alter table public.payments add constraint payments_status_check check (status in
  ('unpaid','partial','paid'));
alter table public.commissions add constraint commissions_status_check check (status in
  ('unpaid','awaiting_confirmation','paid'));
alter table public.products add constraint products_moq_check check (moq >= 1);
alter table public.order_items add constraint order_items_qty_check check (qty >= 1);

create unique index if not exists categories_slug_key on public.categories (slug);
create unique index if not exists products_slug_key on public.products (slug);
create unique index if not exists products_sku_key on public.products (sku);
create unique index if not exists orders_reference_key on public.orders (reference);
create unique index if not exists deliveries_order_id_key on public.deliveries (order_id);
create unique index if not exists payments_order_id_key on public.payments (order_id);
create unique index if not exists commissions_order_id_key on public.commissions (order_id);
create unique index if not exists payment_installments_receipt_key
  on public.payment_installments (receipt_number);

-- 4. The first administrator. Roles live in auth app_metadata, which users
--    cannot edit. Replace the id with your own admin account if different.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where id = '728d6e92-b38e-4ae7-9504-05f2343bdd47';

-- Role of the current request, read from the signed JWT (never from a table).
create or replace function public.app_role() returns text
language sql stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'buyer');
$$;

-- 5. Trigger: every new auth user gets a profile, always as a buyer.
--    Nothing in the sign-up metadata can raise the role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, 'buyer'), '@', 1)
    ), 120),
    'buyer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. Trigger: an order that becomes 'confirmed' gets a draft delivery.
create or replace function public.create_draft_delivery() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    insert into public.deliveries (order_id, status)
    values (new.id, 'draft')
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_confirmed_create_delivery on public.orders;
create trigger orders_confirmed_create_delivery
  after update of status on public.orders
  for each row execute function public.create_draft_delivery();

-- 7. Trigger: a delivery that becomes 'delivered' gets a payment record.
create or replace function public.create_payment_for_delivery() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    insert into public.payments (order_id, delivery_id, buyer_id, total_due, total_paid, status)
    select o.id, new.id, o.buyer_id, o.total, 0, 'unpaid'
    from public.orders o
    where o.id = new.order_id
    on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists deliveries_delivered_create_payment on public.deliveries;
create trigger deliveries_delivered_create_payment
  after update of status on public.deliveries
  for each row execute function public.create_payment_for_delivery();

-- 8. Enforce row level security on every table.
alter table public.profiles             enable row level security;
alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.services             enable row level security;
alter table public.contact_messages     enable row level security;
alter table public.settings             enable row level security;
alter table public.commission_tiers     enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.deliveries           enable row level security;
alter table public.payments             enable row level security;
alter table public.payment_installments enable row level security;
alter table public.commissions          enable row level security;

-- Catalogue: anyone can read, only admins can change.
create policy categories_public_read on public.categories for select using (true);
create policy categories_admin_manage on public.categories for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy products_public_read on public.products for select using (true);
create policy products_admin_manage on public.products for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy services_public_read on public.services for select using (true);
create policy services_admin_manage on public.services for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- Profiles: a user reads their own row; admins read all. Writes go through the API.
create policy profiles_select_own on public.profiles for select
  using (auth.uid() = id or public.app_role() = 'admin');

-- Orders: buyers see their own, staff see orders assigned to them, admins manage all.
create policy orders_read_own_or_assigned on public.orders for select
  using (
    buyer_id = auth.uid()
    or exists (select 1 from public.deliveries d
               where d.order_id = orders.id and d.staff_id = auth.uid())
  );
create policy orders_admin_manage on public.orders for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

create policy order_items_read_visible_orders on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_items.order_id));
create policy order_items_admin_manage on public.order_items for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- Deliveries: staff see only their own assignments.
create policy deliveries_staff_read_own on public.deliveries for select
  using (staff_id = auth.uid());
create policy deliveries_admin_manage on public.deliveries for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- Payments and installments: the buyer, the assigned staff member, and admins.
create policy payments_read_own_or_assigned on public.payments for select
  using (
    buyer_id = auth.uid()
    or exists (select 1 from public.deliveries d
               where d.id = payments.delivery_id and d.staff_id = auth.uid())
  );
create policy payments_admin_manage on public.payments for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

create policy installments_read_visible_payments on public.payment_installments for select
  using (exists (select 1 from public.payments p where p.id = payment_installments.payment_id));
create policy installments_admin_manage on public.payment_installments for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- Commissions: staff see their own.
create policy commissions_staff_read_own on public.commissions for select
  using (staff_id = auth.uid());
create policy commissions_admin_manage on public.commissions for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- Admin-only tables.
create policy settings_admin_only on public.settings for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy commission_tiers_admin_only on public.commission_tiers for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');
create policy contact_messages_admin_only on public.contact_messages for all
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

commit;
