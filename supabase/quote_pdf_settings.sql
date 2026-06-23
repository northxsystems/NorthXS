-- NorthX quote PDF settings setup
-- Run this manually in the NorthX Supabase SQL editor.
-- This adds a per-client settings table for browser-generated quote PDFs.

create table if not exists public.client_quote_pdf_settings (
  client_id text primary key,
  company_display_name text,
  logo_url text,
  business_phone text,
  business_email text,
  website text,
  business_address text,
  default_quote_terms text,
  default_tax_rate numeric(6, 3),
  pdf_accent_color text default '#4f8cff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_quote_pdf_settings_accent_color_check
    check (pdf_accent_color is null or pdf_accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint client_quote_pdf_settings_tax_rate_check
    check (default_tax_rate is null or default_tax_rate >= 0)
);

grant select, insert, update on public.client_quote_pdf_settings to authenticated;

alter table public.client_quote_pdf_settings enable row level security;

drop policy if exists "Authenticated users can read their client quote PDF settings"
  on public.client_quote_pdf_settings;

create policy "Authenticated users can read their client quote PDF settings"
  on public.client_quote_pdf_settings
  for select
  to authenticated
  using (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can insert their client quote PDF settings"
  on public.client_quote_pdf_settings;

create policy "Authenticated users can insert their client quote PDF settings"
  on public.client_quote_pdf_settings
  for insert
  to authenticated
  with check (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can update their client quote PDF settings"
  on public.client_quote_pdf_settings;

create policy "Authenticated users can update their client quote PDF settings"
  on public.client_quote_pdf_settings
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
