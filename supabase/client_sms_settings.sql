-- NorthX client SMS settings setup
-- Run this manually in the NorthX Supabase SQL editor.
-- Stores missed call auto-reply copy per client_id.

create table if not exists public.client_sms_settings (
  client_id text primary key,
  missed_call_auto_reply_message text not null default 'Hey, sorry we missed your call. Reply here and our team will get back to you shortly.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.client_sms_settings to authenticated;

alter table public.client_sms_settings enable row level security;

drop policy if exists "Authenticated users can read their client SMS settings"
  on public.client_sms_settings;

create policy "Authenticated users can read their client SMS settings"
  on public.client_sms_settings
  for select
  to authenticated
  using (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can insert their client SMS settings"
  on public.client_sms_settings;

create policy "Authenticated users can insert their client SMS settings"
  on public.client_sms_settings
  for insert
  to authenticated
  with check (
    client_id in (
      select profiles.client_id
      from public.profiles
      where profiles.id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can update their client SMS settings"
  on public.client_sms_settings;

create policy "Authenticated users can update their client SMS settings"
  on public.client_sms_settings
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
