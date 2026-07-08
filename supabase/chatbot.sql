-- NorthX V1 chatbot setup
-- Run this manually in the NorthX Supabase SQL editor.

create table if not exists public.chatbot_settings (
  client_id uuid primary key,
  bot_enabled boolean not null default true,
  welcome_message text not null default 'Hi! How can we help today?',
  primary_color text not null default '#4f8cff',
  collect_quotes boolean not null default true,
  collect_callbacks boolean not null default true,
  business_faq text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chatbot_conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  company_slug text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists public.chatbot_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  conversation_id uuid references public.chatbot_conversations(id) on delete cascade,
  sender text not null,
  message text not null,
  created_at timestamptz not null default now(),
  constraint chatbot_messages_sender_check
    check (sender in ('bot', 'user', 'system'))
);

-- Existing capture tables need source fields for chatbot attribution.
alter table public.quote_requests
  add column if not exists source text;

alter table public.leads
  add column if not exists source text;

create index if not exists chatbot_conversations_client_created_idx
  on public.chatbot_conversations (client_id, created_at desc);

create index if not exists chatbot_messages_conversation_created_idx
  on public.chatbot_messages (conversation_id, created_at);

grant select, insert, update on public.chatbot_settings to authenticated;
grant select on public.chatbot_settings to anon;
grant insert on public.chatbot_conversations to anon;
grant insert on public.chatbot_messages to anon;
grant insert on public.quote_requests to anon;
grant insert on public.leads to anon;

alter table public.chatbot_settings enable row level security;
alter table public.chatbot_conversations enable row level security;
alter table public.chatbot_messages enable row level security;

drop policy if exists "Authenticated users can manage their chatbot settings"
  on public.chatbot_settings;

drop policy if exists "Public can read enabled chatbot settings"
  on public.chatbot_settings;

drop policy if exists "Public can create chatbot conversations"
  on public.chatbot_conversations;

drop policy if exists "Public can create chatbot messages"
  on public.chatbot_messages;

create policy "Authenticated users can manage their chatbot settings"
  on public.chatbot_settings
  for all
  to authenticated
  using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "Public can read enabled chatbot settings"
  on public.chatbot_settings
  for select
  to anon
  using (bot_enabled = true);

create policy "Public can create chatbot conversations"
  on public.chatbot_conversations
  for insert
  to anon
  with check (
    exists (
      select 1
      from public.client_settings
      join public.chatbot_settings
        on chatbot_settings.client_id::text = client_settings.client_id::text
      where client_settings.client_id::text = chatbot_conversations.client_id::text
        and client_settings.company_slug = chatbot_conversations.company_slug
        and chatbot_settings.bot_enabled = true
    )
  );

create policy "Public can create chatbot messages"
  on public.chatbot_messages
  for insert
  to anon
  with check (
    exists (
      select 1
      from public.chatbot_conversations
      join public.chatbot_settings
        on chatbot_settings.client_id = chatbot_conversations.client_id
      where chatbot_conversations.id = chatbot_messages.conversation_id
        and chatbot_conversations.client_id = chatbot_messages.client_id
        and chatbot_settings.bot_enabled = true
    )
  );

-- If quote_requests RLS is enabled, this permits public chatbot quote submissions
-- only for clients with an enabled chatbot.
drop policy if exists "Public can submit chatbot quote requests"
  on public.quote_requests;

create policy "Public can submit chatbot quote requests"
  on public.quote_requests
  for insert
  to anon
  with check (
    source = 'chatbot'
    and status = 'new'
    and exists (
      select 1
      from public.chatbot_settings
      where chatbot_settings.client_id::text = quote_requests.client_id::text
        and chatbot_settings.bot_enabled = true
        and chatbot_settings.collect_quotes = true
    )
  );

-- If leads RLS is enabled, this permits public callback leads from the chatbot.
drop policy if exists "Public can submit chatbot callback leads"
  on public.leads;

create policy "Public can submit chatbot callback leads"
  on public.leads
  for insert
  to anon
  with check (
    source = 'chatbot_callback'
    and exists (
      select 1
      from public.chatbot_settings
      where chatbot_settings.client_id::text = leads.client_id::text
        and chatbot_settings.bot_enabled = true
        and chatbot_settings.collect_callbacks = true
    )
  );

-- The widget reads client_settings by company_slug. If client_settings RLS blocks anon,
-- add a public select policy scoped to fields you are comfortable exposing.
