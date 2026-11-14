-- =============================================================================
-- Waraq Pro: new notification type for contact-form (Inbox) messages.
--
-- STATUS: run once in the Supabase SQL editor after 0006. Idempotent.
-- =============================================================================

alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'info',
    'order_new',
    'order_confirmed',
    'order_on_the_way',
    'delivery_assigned',
    'message_new'
  ));
