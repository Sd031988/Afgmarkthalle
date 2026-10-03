-- Werbebereich: Beiträge mit Video oder Fotos, Meldungen, Moderation.
-- Wird nach schema.sql ausgeführt.

-- ---------- Moderation ----------

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- Beiträge ----------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('video', 'photos')),
  media jsonb not null,
  caption text not null default '' check (char_length(caption) <= 500),
  listing_id uuid references public.listings (id) on delete set null,
  duration numeric(5, 1) check (duration is null or (duration > 0 and duration <= 31)),
  reports integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index posts_created_idx on public.posts (created_at desc);

create table public.post_reports (
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'unsafe', 'offensive', 'other')),
  created_at timestamptz not null default now(),
  primary key (post_id, reporter_id)
);

create or replace function public.posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int; i int; item jsonb; prefix text;
begin
  if auth.uid() is null then raise exception 'MH:login'; end if;
  new.author_id := auth.uid();
  new.reports := 0;
  new.hidden := false;
  new.created_at := now();
  if (select count(*) from posts where author_id = new.author_id and created_at > now() - interval '24 hours') >= 10 then
    raise exception 'MH:rate_limit';
  end if;
  if jsonb_typeof(new.media) <> 'array' then raise exception 'MH:media_invalid'; end if;
  n := jsonb_array_length(new.media);
  if new.kind = 'video' and n <> 1 then raise exception 'MH:media_invalid'; end if;
  if new.kind = 'photos' and (n < 1 or n > 4) then raise exception 'MH:media_invalid'; end if;
  if new.kind = 'video' and new.duration is null then raise exception 'MH:media_invalid'; end if;
  prefix := '%/storage/v1/object/public/ad-media/' || auth.uid()::text || '/%';
  for i in 0 .. n - 1 loop
    item := new.media -> i;
    if jsonb_typeof(item) <> 'object' or (item ->> 'url') is null or (item ->> 'url') not like 'https://%'
       or (item ->> 'url') not like prefix
       or ((item ->> 'poster') is not null and (item ->> 'poster') not like prefix) then
      raise exception 'MH:media_invalid';
    end if;
  end loop;
  if new.listing_id is not null and not exists (select 1 from listings where id = new.listing_id and seller_id = auth.uid()) then
    new.listing_id := null;
  end if;
  return new;
end
$$;

create trigger posts_guard before insert on public.posts
  for each row execute function public.posts_guard();

alter table public.posts enable row level security;
create policy "posts_read_visible" on public.posts for select
  using (not hidden or author_id = auth.uid() or public.is_admin());
create policy "posts_insert_own" on public.posts for insert to authenticated
  with check (author_id = auth.uid());
create policy "posts_delete_own_or_admin" on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

revoke update on public.posts from anon, authenticated;

alter table public.post_reports enable row level security;
revoke all on public.post_reports from anon, authenticated;

create or replace function public.report_post(p_post uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p posts; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'MH:login'; end if;
  select * into p from posts where id = p_post for update;
  if not found then raise exception 'MH:not_found'; end if;
  if p.author_id = uid then raise exception 'MH:own_item'; end if;
  if p_reason not in ('spam', 'unsafe', 'offensive', 'other') then p_reason := 'other'; end if;
  if (select count(*) from post_reports where reporter_id = uid and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'MH:rate_limit';
  end if;
  insert into post_reports (post_id, reporter_id, reason) values (p_post, uid, p_reason)
  on conflict (post_id, reporter_id) do nothing;
  if found then
    update posts set reports = reports + 1, hidden = (hidden or reports + 1 >= 3) where id = p_post;
  end if;
end
$$;

create or replace function public.admin_set_hidden(p_post uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'MH:not_found'; end if;
  update posts set hidden = p_hidden, reports = case when p_hidden then reports else 0 end where id = p_post;
  if not p_hidden then delete from post_reports where post_id = p_post; end if;
end
$$;

revoke execute on function public.report_post(uuid, text) from anon, public;
revoke execute on function public.admin_set_hidden(uuid, boolean) from anon, public;
grant execute on function public.report_post(uuid, text) to authenticated;
grant execute on function public.admin_set_hidden(uuid, boolean) to authenticated;

-- ---------- Speicher für Werbung ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-media', 'ad-media', true, 15728640, array['video/mp4', 'video/quicktime', 'image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "ad_media_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'ad-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ad_media_delete_own_or_admin" on storage.objects for delete to authenticated
  using (bucket_id = 'ad-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
