-- NorthX customer timeline setup
-- Run this manually in the NorthX Supabase SQL editor.
-- Timeline client_id intentionally stores auth.users.id per the Customer Timeline page.

create table if not exists public.customer_timeline (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  customer_id uuid null,
  lead_id uuid null,
  quote_request_id uuid null,
  event_type text not null,
  event_title text not null,
  event_description text,
  created_at timestamptz not null default now(),
  constraint customer_timeline_event_type_check
    check (
      event_type in (
        'lead_created',
        'missed_call',
        'sms_sent',
        'quote_requested',
        'quote_sent',
        'follow_up_scheduled',
        'follow_up_sent',
        'note_added'
      )
    )
);

-- If your live leads.id or quote_requests.id columns are bigint/int8, use matching bigint
-- columns for lead_id and quote_request_id instead of uuid.

create index if not exists customer_timeline_client_created_idx
  on public.customer_timeline (client_id, created_at desc);

create index if not exists customer_timeline_customer_idx
  on public.customer_timeline (client_id, customer_id, created_at desc)
  where customer_id is not null;

create index if not exists customer_timeline_lead_idx
  on public.customer_timeline (client_id, lead_id, created_at desc)
  where lead_id is not null;

create index if not exists customer_timeline_quote_request_idx
  on public.customer_timeline (client_id, quote_request_id, created_at desc)
  where quote_request_id is not null;

grant select, insert on public.customer_timeline to authenticated;

alter table public.customer_timeline enable row level security;

drop policy if exists "Authenticated users can read their customer timeline"
  on public.customer_timeline;

drop policy if exists "Authenticated users can insert their customer timeline"
  on public.customer_timeline;

create policy "Authenticated users can read their customer timeline"
  on public.customer_timeline
  for select
  to authenticated
  using (client_id = auth.uid());

create policy "Authenticated users can insert their customer timeline"
  on public.customer_timeline
  for insert
  to authenticated
  with check (client_id = auth.uid());

-- Optional only if public quote intake should write quote_requested events directly.
-- Prefer a server-side trigger for production so anon users cannot forge timeline rows.
-- grant insert on public.customer_timeline to anon;
