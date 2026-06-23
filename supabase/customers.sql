-- NorthX customers setup
-- Run this manually in the NorthX Supabase SQL editor.
-- This creates customer records per client and auto-links quote requests by phone/email.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  name text,
  phone text,
  email text,
  address text,
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_client_updated_idx
  on public.customers (client_id, updated_at desc);

create index if not exists customers_client_phone_idx
  on public.customers (client_id, phone)
  where phone is not null;

create index if not exists customers_client_email_idx
  on public.customers (client_id, lower(email))
  where email is not null;

alter table public.quote_requests
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

alter table public.quotes
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists quote_requests_customer_idx
  on public.quote_requests (customer_id);

create index if not exists quotes_customer_idx
  on public.quotes (customer_id);

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists customer_notes_customer_created_idx
  on public.customer_notes (customer_id, created_at desc);

grant select, insert, update on public.customers to authenticated;
grant select, insert on public.customer_notes to authenticated;

alter table public.customers enable row level security;
alter table public.customer_notes enable row level security;

drop policy if exists "Authenticated users can read their client customers"
  on public.customers;

create policy "Authenticated users can read their client customers"
  on public.customers
  for select
  to authenticated
  using (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can insert their client customers"
  on public.customers;

create policy "Authenticated users can insert their client customers"
  on public.customers
  for insert
  to authenticated
  with check (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can update their client customers"
  on public.customers;

create policy "Authenticated users can update their client customers"
  on public.customers
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

drop policy if exists "Authenticated users can read their client customer notes"
  on public.customer_notes;

create policy "Authenticated users can read their client customer notes"
  on public.customer_notes
  for select
  to authenticated
  using (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can insert their client customer notes"
  on public.customer_notes;

create policy "Authenticated users can insert their client customer notes"
  on public.customer_notes
  for insert
  to authenticated
  with check (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_touch_updated_at
  on public.customers;

create trigger customers_touch_updated_at
  before update on public.customers
  for each row
  execute function public.touch_updated_at();

create or replace function public.assign_quote_request_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_customer_id uuid;
begin
  select customers.id
    into matched_customer_id
  from public.customers
  where customers.client_id = new.client_id
    and (
      (new.phone is not null and customers.phone = new.phone)
      or (
        new.email is not null
        and customers.email is not null
        and lower(customers.email) = lower(new.email)
      )
    )
  order by customers.updated_at desc
  limit 1;

  if matched_customer_id is null then
    insert into public.customers (
      client_id,
      name,
      phone,
      email,
      address,
      status
    )
    values (
      new.client_id,
      new.customer_name,
      new.phone,
      new.email,
      new.address,
      'active'
    )
    returning id into matched_customer_id;
  else
    update public.customers
      set
        name = coalesce(nullif(new.customer_name, ''), name),
        phone = coalesce(nullif(new.phone, ''), phone),
        email = coalesce(nullif(new.email, ''), email),
        address = coalesce(nullif(new.address, ''), address),
        updated_at = now()
    where customers.id = matched_customer_id;
  end if;

  new.customer_id = matched_customer_id;
  return new;
end;
$$;

drop trigger if exists quote_requests_assign_customer
  on public.quote_requests;

create trigger quote_requests_assign_customer
  before insert on public.quote_requests
  for each row
  execute function public.assign_quote_request_customer();

create or replace function public.assign_quote_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is null and new.quote_request_id is not null then
    select quote_requests.customer_id
      into new.customer_id
    from public.quote_requests
    where quote_requests.id = new.quote_request_id
      and quote_requests.client_id = new.client_id
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists quotes_assign_customer
  on public.quotes;

create trigger quotes_assign_customer
  before insert on public.quotes
  for each row
  execute function public.assign_quote_customer();

do $$
declare
  request_record record;
  matched_customer_id uuid;
begin
  for request_record in
    select *
    from public.quote_requests
    where customer_id is null
  loop
    select customers.id
      into matched_customer_id
    from public.customers
    where customers.client_id = request_record.client_id
      and (
        (request_record.phone is not null and customers.phone = request_record.phone)
        or (
          request_record.email is not null
          and customers.email is not null
          and lower(customers.email) = lower(request_record.email)
        )
      )
    order by customers.updated_at desc
    limit 1;

    if matched_customer_id is null then
      insert into public.customers (
        client_id,
        name,
        phone,
        email,
        address,
        status
      )
      values (
        request_record.client_id,
        request_record.customer_name,
        request_record.phone,
        request_record.email,
        request_record.address,
        'active'
      )
      returning id into matched_customer_id;
    end if;

    update public.quote_requests
      set customer_id = matched_customer_id
    where id = request_record.id;
  end loop;
end;
$$;

update public.quotes
  set customer_id = quote_requests.customer_id
from public.quote_requests
where quotes.quote_request_id = quote_requests.id
  and quotes.client_id = quote_requests.client_id
  and quotes.customer_id is null
  and quote_requests.customer_id is not null;
