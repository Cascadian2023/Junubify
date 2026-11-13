-- Junubify production schema for Supabase. Apply via Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  artist_name text not null check (char_length(artist_name) between 1 and 120),
  genre text not null,
  album text check (album is null or char_length(album) <= 120),
  audio_path text not null,
  audio_url text not null,
  cover_url text,
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  created_at timestamptz not null default now()
);
create index if not exists tracks_published_created_idx on public.tracks (created_at desc) where status = 'published';
create index if not exists tracks_creator_idx on public.tracks (creator_id, created_at desc);

create table if not exists public.track_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

create table if not exists public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('mgurush', 'momo', 'zain')),
  phone_number text not null check (char_length(phone_number) between 6 and 32),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('fan', 'artist_pro')),
  provider text not null,
  provider_reference text unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'cancelled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.track_likes enable row level security;
alter table public.payout_requests enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Published tracks and owner tracks are readable" on public.tracks;
create policy "Published tracks and owner tracks are readable" on public.tracks for select using (status = 'published' or (select auth.uid()) = creator_id);
drop policy if exists "Creators submit pending tracks" on public.tracks;
create policy "Creators submit pending tracks" on public.tracks for insert to authenticated with check ((select auth.uid()) = creator_id and status = 'pending');
drop policy if exists "Creators update own pending tracks" on public.tracks;
create policy "Creators update own pending tracks" on public.tracks for update to authenticated using ((select auth.uid()) = creator_id and status = 'pending') with check ((select auth.uid()) = creator_id and status = 'pending');
drop policy if exists "Creators delete own pending tracks" on public.tracks;
create policy "Creators delete own pending tracks" on public.tracks for delete to authenticated using ((select auth.uid()) = creator_id and status = 'pending');

drop policy if exists "Users read own likes" on public.track_likes;
create policy "Users read own likes" on public.track_likes for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users add own likes to published tracks" on public.track_likes;
create policy "Users add own likes to published tracks" on public.track_likes for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.tracks where id = track_id and status = 'published'));
drop policy if exists "Users remove own likes" on public.track_likes;
create policy "Users remove own likes" on public.track_likes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users create own payout requests" on public.payout_requests;
create policy "Users create own payout requests" on public.payout_requests for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users read own payout requests" on public.payout_requests;
create policy "Users read own payout requests" on public.payout_requests for select to authenticated using ((select auth.uid()) = user_id);

-- Subscription rows are written by trusted payment webhooks/service-role code only.
drop policy if exists "Users read own subscriptions" on public.subscriptions;
create policy "Users read own subscriptions" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tracks', 'tracks', true, 52428800, array['audio/mpeg', 'audio/wav', 'audio/x-wav'])
on conflict (id) do update set public = true, file_size_limit = 52428800, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users upload to their own folder" on storage.objects;
create policy "Authenticated users upload to their own folder" on storage.objects for insert to authenticated
with check (bucket_id = 'tracks' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users manage own track files" on storage.objects;
create policy "Users manage own track files" on storage.objects for delete to authenticated
using (bucket_id = 'tracks' and (storage.foldername(name))[1] = (select auth.uid())::text);
