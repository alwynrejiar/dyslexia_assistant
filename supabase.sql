-- Run these in Supabase SQL Editor

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  age integer not null,
  role text not null,
  role_custom text,
  languages text not null,
  email text not null,
  username text not null unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If profiles already exist, ensure avatar_url is present.
alter table if exists public.profiles
  add column if not exists avatar_url text;

create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  pdf_url text not null,
  original_image_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.saved_reports enable row level security;

create policy "Profiles are self readable" on public.profiles
  for select using (auth.uid() = user_id);

create policy "Profiles are self insert" on public.profiles
  for insert with check (auth.uid() = user_id);

create policy "Profiles are self update" on public.profiles
  for update using (auth.uid() = user_id);

create policy "Reports are self readable" on public.saved_reports
  for select using (auth.uid() = user_id);

create policy "Reports are self insert" on public.saved_reports
  for insert with check (auth.uid() = user_id);

create policy "Reports are self delete" on public.saved_reports
  for delete using (auth.uid() = user_id);

-- Storage: create buckets named 'reports', 'originals', and 'avatars' in Supabase Storage.
-- Make them public, or add policies similar to above for authenticated users.
