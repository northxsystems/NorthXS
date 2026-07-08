-- NorthX internal notes setup
-- Run this manually in the NorthX Supabase SQL editor after customer_notes exists.
-- Notes are private to the authenticated user; client_id stores auth.users.id as text.

alter table public.customer_notes
  alter column customer_id drop not null,
  add column if not exists lead_id uuid null,
  add column if not exists quote_request_id uuid null;

-- If your live leads.id or quote_requests.id columns are bigint/int8, use matching bigint
-- columns for lead_id and quote_request_id instead of uuid.

create index if not exists customer_notes_auth_customer_idx
  on public.customer_notes (client_id, customer_id, created_at desc)
  where customer_id is not null;

create index if not exists customer_notes_auth_lead_idx
  on public.customer_notes (client_id, lead_id, created_at desc)
  where lead_id is not null;

create index if not exists customer_notes_auth_quote_request_idx
  on public.customer_notes (client_id, quote_request_id, created_at desc)
  where quote_request_id is not null;

grant select, insert, update, delete on public.customer_notes to authenticated;

alter table public.customer_notes enable row level security;

drop policy if exists "Authenticated users can read their internal notes"
  on public.customer_notes;

drop policy if exists "Authenticated users can read their client customer notes"
  on public.customer_notes;

drop policy if exists "Authenticated users can insert their internal notes"
  on public.customer_notes;

drop policy if exists "Authenticated users can insert their client customer notes"
  on public.customer_notes;

drop policy if exists "Authenticated users can update their internal notes"
  on public.customer_notes;

drop policy if exists "Authenticated users can delete their internal notes"
  on public.customer_notes;

create policy "Authenticated users can read their internal notes"
  on public.customer_notes
  for select
  to authenticated
  using (client_id = auth.uid()::text);

create policy "Authenticated users can insert their internal notes"
  on public.customer_notes
  for insert
  to authenticated
  with check (client_id = auth.uid()::text);

create policy "Authenticated users can update their internal notes"
  on public.customer_notes
  for update
  to authenticated
  using (client_id = auth.uid()::text)
  with check (client_id = auth.uid()::text);

create policy "Authenticated users can delete their internal notes"
  on public.customer_notes
  for delete
  to authenticated
  using (client_id = auth.uid()::text);
