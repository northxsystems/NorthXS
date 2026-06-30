-- NorthX quote follow-up scheduled SMS support
-- Run this manually in the NorthX Supabase SQL editor after scheduled_messages exists.
-- This reuses public.scheduled_messages for quote follow-ups instead of creating a new table.

-- Needed columns if they are not already present:
alter table public.scheduled_messages
  add column if not exists quote_request_id uuid null,
  add column if not exists message_type text,
  add column if not exists customer_name text;

-- If your live quote_requests.id column is bigint/int8 instead of uuid, use this instead:
-- alter table public.scheduled_messages add column if not exists quote_request_id bigint null;

create index if not exists scheduled_messages_quote_follow_up_idx
  on public.scheduled_messages (client_id, quote_request_id, message_type, status);

create index if not exists scheduled_messages_quote_follow_up_send_idx
  on public.scheduled_messages (client_id, message_type, send_at desc);

grant select, insert, update on public.scheduled_messages to authenticated;

alter table public.scheduled_messages enable row level security;

drop policy if exists "Authenticated users can read scheduled messages for their client"
  on public.scheduled_messages;

drop policy if exists "Authenticated users can insert scheduled messages for their client"
  on public.scheduled_messages;

drop policy if exists "Authenticated users can update scheduled messages for their client"
  on public.scheduled_messages;

create policy "Authenticated users can read scheduled messages for their client"
  on public.scheduled_messages
  for select
  to authenticated
  using (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

create policy "Authenticated users can insert scheduled messages for their client"
  on public.scheduled_messages
  for insert
  to authenticated
  with check (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

create policy "Authenticated users can update scheduled messages for their client"
  on public.scheduled_messages
  for update
  to authenticated
  using (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  )
  with check (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

-- Quote follow-up rows should be inserted with:
-- message_type = 'quote_follow_up'
-- status = 'pending'
-- send_at = now() + interval '24 hours'
