-- NorthX quotes table setup
-- Run this manually in the NorthX Supabase SQL editor.
-- This creates the table only. It does not change any RLS policies.
-- public.quote_requests.id is bigint/int8 in NorthX.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_request_id bigint references public.quote_requests(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  client_id text not null,
  customer_name text,
  phone text,
  email text,
  service_requested text,
  problem_description text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0,
  tax numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_status_check
    check (status in ('draft', 'sent', 'accepted', 'declined'))
);

create index if not exists quotes_client_created_idx
  on public.quotes (client_id, created_at desc);

create index if not exists quotes_quote_request_idx
  on public.quotes (quote_request_id);

create index if not exists quotes_customer_idx
  on public.quotes (customer_id);

grant select, insert, update on public.quotes to authenticated;
