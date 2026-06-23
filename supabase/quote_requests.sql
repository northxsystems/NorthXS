-- NorthX quote requests setup
-- Run this manually in the NorthX Supabase SQL editor.
-- NorthX profiles.client_id is text, for example: demo-client.

create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  customer_name text not null,
  phone text not null,
  email text,
  service_requested text not null,
  trade text,
  urgency text,
  address text,
  problem_description text not null,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  constraint quote_requests_status_check
    check (status in ('new', 'reviewing', 'quote_sent', 'booked', 'lost'))
);

drop policy if exists "Authenticated users can read quote requests for their client"
  on public.quote_requests;

drop policy if exists "Authenticated users can update quote requests for their client"
  on public.quote_requests;

drop policy if exists "Public can submit NorthX quote requests"
  on public.quote_requests;

alter table public.quote_requests
  alter column client_id type text using client_id::text;

create index if not exists quote_requests_client_created_idx
  on public.quote_requests (client_id, created_at desc);

grant insert on public.quote_requests to anon;
grant select, update on public.quote_requests to authenticated;

alter table public.quote_requests enable row level security;

create policy "Authenticated users can read quote requests for their client"
  on public.quote_requests
  for select
  to authenticated
  using (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

create policy "Authenticated users can update quote requests for their client"
  on public.quote_requests
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

create policy "Public can submit NorthX quote requests"
  on public.quote_requests
  for insert
  to anon
  with check (
    client_id = 'demo-client'
    and status = 'new'
  );

-- Optional, if realtime is not already enabled for this table:
-- alter publication supabase_realtime add table public.quote_requests;
