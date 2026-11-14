-- =============================================================================
-- Waraq Pro: vehicle fleet management.
--
-- Adds:
--   vehicles                 – managed fleet (plate auto-populates on delivery)
--   vehicle_fuel_logs        – fueling records with bill attachment
--   vehicle_maintenance_logs – maintenance records with bill attachment
--   vehicle_movement_requests– permission requests to move a vehicle without an
--                              order; only an administrator may approve/reject.
--   settings.require_odometer_on_dispatch – when true, dispatch requires odometer
--   deliveries.vehicle_id / dispatch_odometer – link + odometer captured at dispatch
--
-- STATUS: run once in the Supabase SQL editor after 0006. Idempotent where possible.
-- =============================================================================

begin;

-- 1. Settings: optional odometer requirement on dispatch ----------------------
alter table public.settings
  add column if not exists require_odometer_on_dispatch boolean not null default false;

-- 2. Deliveries: link to a managed vehicle and odometer at dispatch -----------
alter table public.deliveries
  add column if not exists vehicle_id integer,
  add column if not exists dispatch_odometer numeric;

-- 3. Vehicles -----------------------------------------------------------------
create table if not exists public.vehicles (
  id serial primary key,
  name text not null,
  plate_number text not null,
  vehicle_type text,
  current_odometer numeric not null default 0,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicles_plate_number_uidx
  on public.vehicles (lower(plate_number));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deliveries_vehicle_id_fkey') then
    alter table public.deliveries
      add constraint deliveries_vehicle_id_fkey
      foreign key (vehicle_id) references public.vehicles(id) on delete set null;
  end if;
end $$;

-- 4. Fueling logs -------------------------------------------------------------
create table if not exists public.vehicle_fuel_logs (
  id serial primary key,
  vehicle_id integer not null references public.vehicles(id) on delete cascade,
  filled_at timestamptz not null default now(),
  odometer numeric,
  liters numeric,
  price_total numeric not null default 0,
  station text,
  notes text,
  bill_path text,
  bill_url text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- 5. Maintenance logs ---------------------------------------------------------
create table if not exists public.vehicle_maintenance_logs (
  id serial primary key,
  vehicle_id integer not null references public.vehicles(id) on delete cascade,
  serviced_at timestamptz not null default now(),
  odometer numeric,
  service_type text not null,
  price_total numeric not null default 0,
  vendor text,
  notes text,
  bill_path text,
  bill_url text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- 6. Movement requests (no order) ---------------------------------------------
-- status: pending | approved | rejected | completed | cancelled
create table if not exists public.vehicle_movement_requests (
  id serial primary key,
  vehicle_id integer not null references public.vehicles(id) on delete cascade,
  requested_by uuid not null,
  reason text not null,
  status text not null default 'pending',
  departure_odometer numeric,
  return_odometer numeric,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  departed_at timestamptz,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_movement_requests_status_check
    check (status in ('pending', 'approved', 'rejected', 'completed', 'cancelled'))
);

-- 7. Storage bucket for vehicle bills/attachments -----------------------------
insert into storage.buckets (id, name, public)
values ('vehicle-docs', 'vehicle-docs', true)
on conflict (id) do nothing;

drop policy if exists "vehicle docs are public" on storage.objects;
create policy "vehicle docs are public" on storage.objects
  for select using (bucket_id = 'vehicle-docs');

drop policy if exists "staff manage vehicle docs" on storage.objects;
create policy "staff manage vehicle docs" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vehicle-docs'
    and public.app_role() in ('admin', 'staff')
  );

drop policy if exists "staff update vehicle docs" on storage.objects;
create policy "staff update vehicle docs" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vehicle-docs'
    and public.app_role() in ('admin', 'staff')
  )
  with check (
    bucket_id = 'vehicle-docs'
    and public.app_role() in ('admin', 'staff')
  );

drop policy if exists "admins delete vehicle docs" on storage.objects;
create policy "admins delete vehicle docs" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vehicle-docs'
    and public.app_role() = 'admin'
  );

commit;
