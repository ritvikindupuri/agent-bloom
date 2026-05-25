
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end; $$;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Elasticsearch connections (per user)
create table public.es_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Default',
  endpoint text not null,
  api_key text not null,
  index_pattern text not null default 'logs-*',
  timestamp_field text not null default '@timestamp',
  ip_field text not null default 'client.ip',
  user_agent_field text not null default 'user_agent.original',
  url_field text not null default 'url.path',
  status_field text not null default 'http.response.status_code',
  is_active boolean not null default true,
  last_tested_at timestamptz,
  last_test_ok boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.es_connections enable row level security;
create policy "es_select_own" on public.es_connections for select using (auth.uid() = user_id);
create policy "es_insert_own" on public.es_connections for insert with check (auth.uid() = user_id);
create policy "es_update_own" on public.es_connections for update using (auth.uid() = user_id);
create policy "es_delete_own" on public.es_connections for delete using (auth.uid() = user_id);
create index on public.es_connections(user_id);

-- Agent conversations
create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New investigation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.agent_conversations enable row level security;
create policy "conv_select_own" on public.agent_conversations for select using (auth.uid() = user_id);
create policy "conv_insert_own" on public.agent_conversations for insert with check (auth.uid() = user_id);
create policy "conv_update_own" on public.agent_conversations for update using (auth.uid() = user_id);
create policy "conv_delete_own" on public.agent_conversations for delete using (auth.uid() = user_id);
create index on public.agent_conversations(user_id, updated_at desc);

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool','system')),
  content text,
  tool_calls jsonb,
  tool_name text,
  tool_result jsonb,
  created_at timestamptz not null default now()
);
alter table public.agent_messages enable row level security;
create policy "msg_select_own" on public.agent_messages for select using (auth.uid() = user_id);
create policy "msg_insert_own" on public.agent_messages for insert with check (auth.uid() = user_id);
create policy "msg_delete_own" on public.agent_messages for delete using (auth.uid() = user_id);
create index on public.agent_messages(conversation_id, created_at);

-- Threat findings
create table public.threat_findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.es_connections(id) on delete set null,
  kind text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  title text not null,
  summary text,
  evidence jsonb,
  ip text,
  user_agent text,
  status text not null default 'open' check (status in ('open','blocked','dismissed','investigating')),
  request_count integer,
  first_seen timestamptz,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);
alter table public.threat_findings enable row level security;
create policy "tf_select_own" on public.threat_findings for select using (auth.uid() = user_id);
create policy "tf_insert_own" on public.threat_findings for insert with check (auth.uid() = user_id);
create policy "tf_update_own" on public.threat_findings for update using (auth.uid() = user_id);
create policy "tf_delete_own" on public.threat_findings for delete using (auth.uid() = user_id);
create index on public.threat_findings(user_id, created_at desc);
create index on public.threat_findings(user_id, status);
