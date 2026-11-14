-- =============================================================================
-- Waraq Pro: web push subscriptions (phone/desktop push notifications).
--
-- One row per browser/installed-app subscription endpoint, per signed-in
-- user. The API (service key) writes this table; RLS is enabled with no
-- client policies, consistent with the notifications table.
--
-- STATUS: run once in the Supabase SQL editor after 0008. Idempotent.
-- =============================================================================

create table if not exists public.push_subscriptions (
  id serial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  lang text not null default 'ar',
  user_agent text,
  created_at timestamptz not null default now()
);

create unique index if not exists push_subscriptions_endpoint_uidx
  on public.push_subscriptions (endpoint);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
