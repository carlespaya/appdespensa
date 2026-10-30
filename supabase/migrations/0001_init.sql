-- Esquema inicial de Despensa (Supabase / PostgreSQL + PostGIS).
-- Datos privados del usuario (tickets) protegidos con RLS; precios comunitarios agregados por zona.

create extension if not exists postgis;
create extension if not exists pg_trgm;

-- ───────────── Catálogo compartido ─────────────
create table stores (
  id          text primary key,              -- 'mercadona', 'lidl', ...
  name        text not null,
  color       text not null
);

create table store_locations (
  id          bigint generated always as identity primary key,
  store_id    text not null references stores(id),
  address     text,
  geom        geography(point, 4326) not null
);
create index store_locations_geom on store_locations using gist (geom);

create table products (
  id          text primary key,
  name        text not null,
  category    text not null,
  ean         text unique                      -- opcional: si el ticket o el usuario aporta código de barras
);

-- Alias de nombres de ticket → producto canónico (aprendido de las correcciones de los usuarios).
create table product_aliases (
  alias       text not null,
  store_id    text references stores(id),
  product_id  text not null references products(id),
  votes       int not null default 1,
  primary key (alias, store_id)
);
create index product_aliases_trgm on product_aliases using gin (alias gin_trgm_ops);

-- ───────────── Datos del usuario ─────────────
create table receipts (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  store_id    text not null references stores(id),
  location_id bigint references store_locations(id),
  date        date not null,
  total       numeric(10,2) not null,
  image_path  text,                            -- Storage: receipts/{user_id}/{id}.jpg
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index receipts_user_date on receipts (user_id, date desc);

create table receipt_lines (
  id          uuid primary key,
  receipt_id  uuid not null references receipts(id) on delete cascade,
  raw_name    text not null,
  product_id  text references products(id),
  quantity    numeric(10,3) not null,
  unit        text not null check (unit in ('ud', 'kg')),
  unit_price  numeric(10,2) not null,
  total       numeric(10,2) not null,
  category    text not null
);

create table shopping_list_items (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id  text not null references products(id),
  quantity    numeric(10,3) not null,
  primary key (user_id, product_id)
);

alter table receipts enable row level security;
alter table receipt_lines enable row level security;
alter table shopping_list_items enable row level security;

create policy "own receipts" on receipts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own lines" on receipt_lines for all
  using (exists (select 1 from receipts r where r.id = receipt_id and r.user_id = auth.uid()))
  with check (exists (select 1 from receipts r where r.id = receipt_id and r.user_id = auth.uid()));
create policy "own list" on shopping_list_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────── Precios comunitarios ─────────────
-- Cada línea confirmada de un ticket es una observación anónima. Nunca se expone user_id.
create table price_observations (
  id           bigint generated always as identity primary key,
  product_id   text not null references products(id),
  store_id     text not null references stores(id),
  location_id  bigint references store_locations(id),
  price        numeric(10,2) not null check (price > 0),
  observed_at  date not null,
  receipt_id   uuid references receipts(id) on delete set null
);
create index price_obs_lookup on price_observations (product_id, store_id, observed_at desc);
alter table price_observations enable row level security;
-- Sin políticas de lectura: los clientes solo leen la vista agregada.

-- Al guardar una línea emparejada se genera la observación (server-side, no confiamos en el cliente).
create or replace function record_price_observation() returns trigger
language plpgsql security definer as $$
begin
  if new.product_id is not null then
    insert into price_observations (product_id, store_id, location_id, price, observed_at, receipt_id)
    select new.product_id, r.store_id, r.location_id, new.unit_price, r.date, r.id
    from receipts r where r.id = new.receipt_id;
  end if;
  return new;
end $$;

create trigger receipt_lines_price_obs after insert on receipt_lines
  for each row execute function record_price_observation();

-- Precio de referencia por producto/súper/zona: mediana de los últimos 30 días (robusta a errores de OCR y ofertas puntuales).
create materialized view community_prices as
select
  o.product_id,
  o.store_id,
  o.location_id,
  percentile_cont(0.5) within group (order by o.price)::numeric(10,2) as price,
  max(o.observed_at) as observed_at,
  count(*) as samples
from price_observations o
where o.observed_at >= current_date - 30
group by o.product_id, o.store_id, o.location_id
having count(*) >= 2;
create unique index community_prices_pk on community_prices (product_id, store_id, coalesce(location_id, 0));

-- Precios cerca del usuario: tiendas en un radio y su distancia.
create or replace function prices_near(lat double precision, lng double precision, radius_km double precision default 5)
returns table (product_id text, store_id text, location_id bigint, price numeric, observed_at date, samples bigint, distance_km double precision)
language sql stable as $$
  select cp.product_id, cp.store_id, cp.location_id, cp.price, cp.observed_at, cp.samples,
         st_distance(sl.geom, st_makepoint(lng, lat)::geography) / 1000 as distance_km
  from community_prices cp
  join store_locations sl on sl.id = cp.location_id
  where st_dwithin(sl.geom, st_makepoint(lng, lat)::geography, radius_km * 1000);
$$;

-- Refresco periódico (pg_cron): cada hora.
-- select cron.schedule('refresh-community-prices', '0 * * * *', 'refresh materialized view concurrently community_prices');
