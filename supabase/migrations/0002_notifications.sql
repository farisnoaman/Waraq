-- Notifications
--
-- One row per event, addressed to a single Supabase Auth user. The text is
-- rendered in the browser from `type` + `params`, so the reader sees the
-- language they chose; the server stays language agnostic. The API writes with
-- the service key, so row level security only protects the read and update
-- paths a browser could reach directly, and the API always scopes its own
-- queries by user_id.

begin;

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'info'
    check (type in ('info', 'order_new', 'order_confirmed', 'order_on_the_way', 'delivery_assigned')),
  params jsonb not null default '{}'::jsonb,
  order_id bigint references public.orders(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_order_idx
  on public.notifications (order_id);

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

commit;
