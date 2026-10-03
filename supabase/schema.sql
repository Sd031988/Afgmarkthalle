-- Markthalle v2: Datenbank-Schema für Supabase
-- Einmal im SQL Editor eines leeren Projekts ausführen.
-- Alle Tabellen haben Row Level Security. Gebote, Sofort-Kauf, Bestellungen und
-- Gespräche laufen über Server-Funktionen, die Preise, Bestand und Regeln prüfen.
-- Fehler werden als Codes gemeldet ("MH:code|wert|wert"), die Seite übersetzt sie
-- in Dari, Paschtu oder Englisch.

create extension if not exists pgcrypto;

-- ---------- Hilfsfunktionen ----------

create or replace function public.ship_zone(a text, b text) returns text
language sql immutable as $$
  select case
    when a = b then 'inland'
    when a = any (array['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'])
     and b = any (array['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE'])
      then 'eu'
    else 'welt'
  end
$$;

create or replace function public.bid_step(v numeric, cur text) returns numeric
language sql immutable as $$
  select case
    when cur = 'AFN' then case when v < 1000 then 10 when v < 10000 then 50 else 100 end
    else case when v < 50 then 1 when v < 500 then 5 else 10 end
  end::numeric
$$;

create or replace function public.valid_tiers(t jsonb) returns boolean
language plpgsql immutable as $$
declare
  i int; n int; m int; p numeric; prev_m int; prev_p numeric;
begin
  if t is null or jsonb_typeof(t) <> 'array' then return false; end if;
  n := jsonb_array_length(t);
  if n < 1 or n > 3 then return false; end if;
  for i in 0 .. n - 1 loop
    m := (t -> i ->> 'min')::int;
    p := (t -> i ->> 'price')::numeric;
    if m is null or p is null or m < 1 or p <= 0 then return false; end if;
    if i > 0 and (m <= prev_m or p >= prev_p) then return false; end if;
    prev_m := m; prev_p := p;
  end loop;
  return true;
exception when others then
  return false;
end
$$;

create or replace function public.valid_ship(s jsonb) returns boolean
language plpgsql immutable as $$
declare
  k text; v jsonb;
begin
  if s is null or jsonb_typeof(s) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(s) loop
    if k not in ('inland', 'eu', 'welt') then return false; end if;
    if jsonb_typeof(v) = 'null' then continue; end if;
    if jsonb_typeof(v) <> 'object' then return false; end if;
    if (v ->> 'c') is null or (v ->> 'c')::numeric < 0 or (v ->> 'c')::numeric > 1000000 then return false; end if;
    if char_length(coalesce(v ->> 'd', '')) > 20 then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end
$$;

-- ---------- Profile ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  seller_type text not null default 'privat' check (seller_type in ('privat', 'gewerbe')),
  country text not null default 'AF' check (country ~ '^[A-Z]{2}$'),
  loc text not null default '' check (char_length(loc) <= 80),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dn text := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if char_length(dn) < 2 or char_length(dn) > 40 then
    dn := 'User-' || left(new.id::text, 6);
  end if;
  insert into public.profiles (id, display_name) values (new.id, dn);
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
create policy "profiles_read" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Angebote ----------

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  seller_type text not null check (seller_type in ('privat', 'gewerbe')),
  type text not null check (type in ('auction', 'fixed', 'wholesale')),
  title text not null check (char_length(title) between 3 and 90),
  cat text not null check (char_length(cat) <= 30),
  cond text not null check (char_length(cond) <= 20),
  descr text not null default '' check (char_length(descr) <= 4000),
  country text not null check (country ~ '^[A-Z]{2}$'),
  loc text not null check (char_length(loc) between 1 and 80),
  currency text not null default 'AFN' check (currency in ('AFN', 'USD', 'EUR')),
  pay_methods text[] not null default array['cash']
    check (cardinality(pay_methods) between 1 and 3 and pay_methods <@ array['cash', 'mobile', 'hawala']),
  price numeric(14, 2) check (price > 0),
  stock integer check (stock >= 0),
  unit text check (char_length(unit) <= 20),
  tiers jsonb,
  start_price numeric(14, 2) check (start_price >= 1),
  buy_now numeric(14, 2),
  ends_at timestamptz,
  ship jsonb not null default '{}'::jsonb,
  pickup boolean not null default false,
  img_url text check (img_url is null or img_url like 'https://%'),
  sold boolean not null default false,
  created_at timestamptz not null default now(),
  constraint listing_type_fields check (
    (type = 'fixed' and price is not null and stock is not null)
    or (type = 'wholesale' and tiers is not null and stock is not null and unit is not null)
    or (type = 'auction' and start_price is not null and ends_at is not null)
  )
);

create index listings_created_idx on public.listings (created_at desc);

create table public.bids (
  id bigserial primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  bidder_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(14, 2) not null,
  is_buy_now boolean not null default false,
  created_at timestamptz not null default now()
);

create index bids_listing_idx on public.bids (listing_id, amount desc);

create or replace function public.listings_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  prof profiles;
  is_rpc boolean := coalesce(current_setting('markthalle.rpc', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    select * into prof from profiles where id = auth.uid();
    if not found then raise exception 'MH:login'; end if;
    if (select count(*) from listings where seller_id = prof.id and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'MH:rate_limit';
    end if;
    new.seller_id := prof.id;
    new.seller_type := prof.seller_type;
    new.sold := false;
    new.created_at := now();
    if new.type = 'wholesale' and prof.seller_type <> 'gewerbe' then
      raise exception 'MH:wholesale_pro';
    end if;
    if new.type = 'auction' and (new.ends_at < now() + interval '4 minutes' or new.ends_at > now() + interval '31 days') then
      raise exception 'MH:auction_duration';
    end if;
  elsif not is_rpc then
    if new.seller_id <> old.seller_id or new.seller_type <> old.seller_type or new.type <> old.type
       or new.sold <> old.sold or new.created_at <> old.created_at or new.country <> old.country
       or new.currency <> old.currency then
      raise exception 'MH:fields_locked';
    end if;
    if old.type = 'auction' then
      if now() >= old.ends_at or exists (select 1 from bids where listing_id = old.id) then
        raise exception 'MH:auction_locked';
      end if;
      if new.ends_at <> old.ends_at then
        raise exception 'MH:auction_locked';
      end if;
    end if;
  end if;

  if new.type = 'wholesale' and not valid_tiers(new.tiers) then
    raise exception 'MH:tiers';
  end if;
  if new.type = 'wholesale' and not is_rpc and new.stock < (new.tiers -> 0 ->> 'min')::int then
    raise exception 'MH:stock_moq';
  end if;
  if new.type = 'auction' and new.buy_now is not null and new.buy_now > 0 and new.buy_now <= new.start_price then
    raise exception 'MH:buynow_start';
  end if;
  if not valid_ship(new.ship) then
    raise exception 'MH:ship_invalid';
  end if;
  if not new.pickup and not exists (
    select 1 from jsonb_each(new.ship) e where jsonb_typeof(e.value) = 'object'
  ) then
    raise exception 'MH:ship_none';
  end if;
  return new;
end
$$;

create trigger listings_guard
  before insert or update on public.listings
  for each row execute function public.listings_guard();

alter table public.listings enable row level security;
create policy "listings_read" on public.listings for select using (true);
create policy "listings_insert_own" on public.listings for insert to authenticated
  with check (seller_id = auth.uid());
create policy "listings_update_own" on public.listings for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());
create policy "listings_delete_own_without_bids" on public.listings for delete to authenticated
  using (seller_id = auth.uid() and not exists (select 1 from public.bids b where b.listing_id = listings.id));

alter table public.bids enable row level security;
create policy "bids_read" on public.bids for select using (true);

-- ---------- Merkliste ----------

create table public.watch (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

alter table public.watch enable row level security;
create policy "watch_read_own" on public.watch for select to authenticated using (user_id = auth.uid());
create policy "watch_insert_own" on public.watch for insert to authenticated with check (user_id = auth.uid());
create policy "watch_delete_own" on public.watch for delete to authenticated using (user_id = auth.uid());

-- ---------- Gespräche (Nachrichten zwischen Käufer und Verkäufer) ----------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete set null,
  title text not null,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade,
  buyer_read_at timestamptz not null default now(),
  seller_read_at timestamptz not null default 'epoch',
  last_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id)
);

create table public.messages (
  id bigserial primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index messages_conv_idx on public.messages (conversation_id, created_at);

create or replace function public.is_participant(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversations where id = cid and (buyer_id = auth.uid() or seller_id = auth.uid()))
$$;

create or replace function public.messages_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_at = new.created_at,
    buyer_read_at = case when buyer_id = new.sender_id then new.created_at else buyer_read_at end,
    seller_read_at = case when seller_id = new.sender_id then new.created_at else seller_read_at end
  where id = new.conversation_id;
  return new;
end
$$;

create or replace function public.messages_before_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.sender_id := auth.uid();
  new.created_at := now();
  if (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 120 then
    raise exception 'MH:rate_limit';
  end if;
  return new;
end
$$;

create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

alter table public.conversations enable row level security;
create policy "conversations_read_participants" on public.conversations for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());

alter table public.messages enable row level security;
create policy "messages_read_participants" on public.messages for select to authenticated
  using (public.is_participant(conversation_id));
create policy "messages_insert_participants" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_participant(conversation_id));

create or replace function public.start_conversation(p_listing uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l listings; uid uuid := auth.uid(); cid uuid;
begin
  if uid is null then raise exception 'MH:login'; end if;
  select * into l from listings where id = p_listing;
  if not found then raise exception 'MH:not_found'; end if;
  if l.seller_id = uid then raise exception 'MH:own_item'; end if;
  select id into cid from conversations where listing_id = p_listing and buyer_id = uid;
  if cid is null then
    if (select count(*) from conversations where buyer_id = uid and created_at > now() - interval '1 hour') >= 30 then
      raise exception 'MH:rate_limit';
    end if;
    insert into conversations (listing_id, title, buyer_id, seller_id)
    values (l.id, l.title, uid, l.seller_id) returning id into cid;
  end if;
  return cid;
end
$$;

create or replace function public.mark_read(p_conv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update conversations set
    buyer_read_at = case when buyer_id = auth.uid() then now() else buyer_read_at end,
    seller_read_at = case when seller_id = auth.uid() then now() else seller_read_at end
  where id = p_conv and (buyer_id = auth.uid() or seller_id = auth.uid());
end
$$;

-- ---------- Bestellungen (immer bei genau einer Verkäuferin / einem Verkäufer) ----------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  no text not null unique,
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  seller_id uuid references public.profiles (id) on delete set null,
  name text not null,
  address text not null default '',
  city text not null,
  country text not null,
  phone text not null default '',
  currency text not null,
  pay_method text not null check (pay_method in ('cash', 'mobile', 'hawala')),
  total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.order_items (
  id bigserial primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  listing_id uuid references public.listings (id) on delete set null,
  seller_id uuid references public.profiles (id) on delete set null,
  title text not null,
  qty integer not null,
  unit text,
  unit_price numeric(14, 2) not null,
  ship_cost numeric(14, 2) not null,
  pickup boolean not null default false,
  customs boolean not null default false,
  status text not null default 'offen' check (status in ('offen', 'versendet', 'abgeholt'))
);

create index order_items_seller_idx on public.order_items (seller_id);
create index orders_seller_idx on public.orders (seller_id);

create or replace function public.is_order_buyer(oid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orders where id = oid and buyer_id = auth.uid())
$$;

alter table public.orders enable row level security;
create policy "orders_read_buyer_seller" on public.orders for select to authenticated
  using (buyer_id = auth.uid() or seller_id = auth.uid());

alter table public.order_items enable row level security;
create policy "order_items_read_buyer_seller" on public.order_items for select to authenticated
  using (seller_id = auth.uid() or public.is_order_buyer(order_id));

-- ---------- Server-Funktionen ----------

create or replace function public.place_bid(p_listing uuid, p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare
  l listings; top numeric; minnext numeric; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'MH:login'; end if;
  select * into l from listings where id = p_listing for update;
  if not found or l.type <> 'auction' then raise exception 'MH:not_found'; end if;
  if l.seller_id = uid then raise exception 'MH:own_bid'; end if;
  if l.sold or now() >= l.ends_at then raise exception 'MH:ended'; end if;
  select max(amount) into top from bids where listing_id = p_listing;
  minnext := case when top is null then l.start_price else top + bid_step(top, l.currency) end;
  if p_amount is null or round(p_amount, 2) < minnext then
    raise exception 'MH:min_bid|%|%', minnext, l.currency;
  end if;
  insert into bids (listing_id, bidder_id, amount) values (p_listing, uid, round(p_amount, 2));
end
$$;

create or replace function public.buy_now(p_listing uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  l listings; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'MH:login'; end if;
  select * into l from listings where id = p_listing for update;
  if not found or l.type <> 'auction' then raise exception 'MH:not_found'; end if;
  if l.seller_id = uid then raise exception 'MH:own_item'; end if;
  if l.sold or now() >= l.ends_at then raise exception 'MH:ended'; end if;
  if l.buy_now is null or l.buy_now <= 0 then raise exception 'MH:no_buynow'; end if;
  if exists (select 1 from bids where listing_id = p_listing) then raise exception 'MH:has_bids'; end if;
  insert into bids (listing_id, bidder_id, amount, is_buy_now) values (p_listing, uid, l.buy_now, true);
  perform set_config('markthalle.rpc', '1', true);
  update listings set ends_at = now() where id = p_listing;
  perform set_config('markthalle.rpc', '', true);
end
$$;

create or replace function public.set_item_status(p_item bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('offen', 'versendet', 'abgeholt') then raise exception 'MH:not_found'; end if;
  update order_items set status = p_status where id = p_item and seller_id = auth.uid();
  if not found then raise exception 'MH:not_found'; end if;
end
$$;

create or replace function public.place_order(
  p_items jsonb, p_ship_to text, p_name text, p_address text, p_city text, p_phone text, p_pay_method text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  it record; l listings; oid uuid; ono text;
  q int; unit_p numeric; zn text; s jsonb; cost numeric; is_pickup boolean;
  top bids; v_total numeric := 0; t jsonb;
  v_seller uuid; v_cur text;
begin
  if uid is null then raise exception 'MH:login'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'MH:cart_invalid';
  end if;
  if p_ship_to !~ '^[A-Z]{2}$' then raise exception 'MH:cart_invalid'; end if;
  if p_pay_method not in ('cash', 'mobile', 'hawala') then raise exception 'MH:pay_method'; end if;
  if char_length(trim(coalesce(p_name, ''))) = 0 or char_length(trim(coalesce(p_city, ''))) = 0 then
    raise exception 'MH:need_name_city';
  end if;
  if (select count(*) from orders where buyer_id = uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'MH:rate_limit';
  end if;

  ono := 'MH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into orders (no, buyer_id, name, address, city, country, phone, currency, pay_method)
  values (ono, uid, left(trim(p_name), 120), left(trim(coalesce(p_address, '')), 300), left(trim(p_city), 80), p_ship_to,
          left(trim(coalesce(p_phone, '')), 40), 'AFN', p_pay_method)
  returning id into oid;

  perform set_config('markthalle.rpc', '1', true);

  for it in
    select (e ->> 'id')::uuid as lid, (e ->> 'qty')::int as qty
      from jsonb_array_elements(p_items) e
     order by (e ->> 'id')
  loop
    select * into l from listings where id = it.lid for update;
    if not found then raise exception 'MH:not_found'; end if;
    if l.seller_id = uid then raise exception 'MH:own_item'; end if;
    if v_seller is null then v_seller := l.seller_id; v_cur := l.currency;
    elsif v_seller <> l.seller_id then raise exception 'MH:one_seller';
    elsif v_cur <> l.currency then raise exception 'MH:one_currency';
    end if;
    if not (p_pay_method = any (l.pay_methods)) then raise exception 'MH:pay_method|%', l.title; end if;
    q := coalesce(it.qty, 0);

    if l.type = 'auction' then
      if l.sold then raise exception 'MH:sold|%', l.title; end if;
      if now() < l.ends_at then raise exception 'MH:running|%', l.title; end if;
      select * into top from bids where listing_id = l.id order by amount desc, created_at asc limit 1;
      if not found or top.bidder_id <> uid then raise exception 'MH:not_won|%', l.title; end if;
      q := 1;
      unit_p := top.amount;
      update listings set sold = true where id = l.id;
    else
      if l.type = 'fixed' then
        if q < 1 then raise exception 'MH:qty|%', l.title; end if;
        unit_p := l.price;
      else
        if q < (l.tiers -> 0 ->> 'min')::int then
          raise exception 'MH:moq|%|%', l.title, (l.tiers -> 0 ->> 'min');
        end if;
        unit_p := null;
        for t in select * from jsonb_array_elements(l.tiers) loop
          if q >= (t ->> 'min')::int then unit_p := (t ->> 'price')::numeric; end if;
        end loop;
      end if;
      if q > l.stock then raise exception 'MH:stock|%|%', l.title, l.stock; end if;
      update listings set stock = stock - q where id = l.id;
    end if;

    zn := ship_zone(l.country, p_ship_to);
    s := l.ship -> zn;
    is_pickup := false;
    if s is not null and jsonb_typeof(s) = 'object' then
      cost := (s ->> 'c')::numeric;
    elsif zn = 'inland' and l.pickup then
      cost := 0; is_pickup := true;
    else
      raise exception 'MH:no_delivery|%', l.title;
    end if;

    insert into order_items (order_id, listing_id, seller_id, title, qty, unit, unit_price, ship_cost, pickup, customs)
    values (oid, l.id, l.seller_id, l.title, q, l.unit, unit_p, cost, is_pickup, zn = 'welt');
    v_total := v_total + round(unit_p * q, 2) + cost;
  end loop;

  perform set_config('markthalle.rpc', '', true);
  update orders set total = v_total, seller_id = v_seller, currency = v_cur where id = oid;
  return ono;
end
$$;

create or replace function public.order_conversation(p_order uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  o orders; uid uuid := auth.uid(); lid uuid; ttl text; cid uuid;
begin
  if uid is null then raise exception 'MH:login'; end if;
  select * into o from orders where id = p_order and (buyer_id = uid or seller_id = uid);
  if not found or o.seller_id is null then raise exception 'MH:not_found'; end if;
  select listing_id, title into lid, ttl from order_items where order_id = o.id order by id limit 1;
  select id into cid from conversations
   where buyer_id = o.buyer_id and seller_id = o.seller_id and listing_id is not distinct from lid
   limit 1;
  if cid is null then
    insert into conversations (listing_id, title, buyer_id, seller_id)
    values (lid, coalesce(ttl, o.no), o.buyer_id, o.seller_id) returning id into cid;
  end if;
  return cid;
end
$$;

revoke execute on function public.place_bid(uuid, numeric) from anon, public;
revoke execute on function public.buy_now(uuid) from anon, public;
revoke execute on function public.set_item_status(bigint, text) from anon, public;
revoke execute on function public.place_order(jsonb, text, text, text, text, text, text) from anon, public;
revoke execute on function public.start_conversation(uuid) from anon, public;
revoke execute on function public.mark_read(uuid) from anon, public;
revoke execute on function public.order_conversation(uuid) from anon, public;
grant execute on function public.place_bid(uuid, numeric) to authenticated;
grant execute on function public.buy_now(uuid) to authenticated;
grant execute on function public.set_item_status(bigint, text) to authenticated;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text) to authenticated;
grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.order_conversation(uuid) to authenticated;

-- ---------- Bilder ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-images', 'listing-images', true, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Eigene Bilder hochladen" on storage.objects;
drop policy if exists "Eigene Bilder löschen" on storage.objects;
create policy "listing_images_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "listing_images_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Öffentlich lesbar sind nur Shopname und Kontoart. Land und Ort sieht nur die Person selbst.
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, seller_type) on public.profiles to anon, authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (display_name, seller_type, country, loc) on public.profiles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

create or replace function public.my_profile() returns public.profiles
language sql stable security definer set search_path = public as $$
  select * from profiles where id = auth.uid()
$$;
revoke execute on function public.my_profile() from anon, public;
grant execute on function public.my_profile() to authenticated;
