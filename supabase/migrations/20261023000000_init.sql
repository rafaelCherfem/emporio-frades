-- Empório Frade’s: esquema inicial
-- Rode no SQL Editor do Supabase (ou `supabase db push`).
-- Princípio: o público só LÊ o que está publicado; só quem está em `admins` escreve.

begin;

-- ---------------------------------------------------------------
-- Quem pode editar
-- ---------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
alter table public.admins force row level security;

-- Cada usuário logado só consegue ver se ELE é admin (o painel usa isso).
drop policy if exists "admins_self_read" on public.admins;
create policy "admins_self_read" on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Ninguém insere/edita admins pela API. Isso é feito só no SQL Editor.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- ---------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Caminho de imagem aceito (espelha src/lib/safe.ts)
create or replace function public.valid_image_path(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null
      or (p ~ '^[a-z0-9][a-z0-9/_-]{0,180}\.(jpe?g|png|webp|avif)$' and p !~ '\.\.');
$$;

-- ---------------------------------------------------------------
-- Dados da loja (linha única)
-- ---------------------------------------------------------------
create table if not exists public.store_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Empório Frade’s' check (char_length(name) between 1 and 80),
  tagline text not null default '' check (char_length(tagline) <= 160),
  about text not null default '' check (char_length(about) <= 1200),
  street text not null default '' check (char_length(street) <= 120),
  number text not null default '' check (char_length(number) <= 20),
  district text not null default '' check (char_length(district) <= 80),
  city text not null default '' check (char_length(city) <= 80),
  state text not null default '' check (state ~ '^([A-Z]{2})?$'),
  zip text not null default '' check (zip ~ '^(\d{5}-?\d{3})?$'),
  reference text not null default '' check (char_length(reference) <= 160),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  phone text not null default '' check (phone ~ '^(\d{10,13})?$'),
  whatsapp text not null default '' check (whatsapp ~ '^(\d{10,13})?$'),
  whatsapp_message text not null default '' check (char_length(whatsapp_message) <= 300),
  email text not null default '' check (email = '' or (char_length(email) <= 254 and email ~ '^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$')),
  instagram text not null default '' check (char_length(instagram) <= 120),
  facebook text not null default '' check (char_length(facebook) <= 120),
  tiktok text not null default '' check (char_length(tiktok) <= 120),
  hours jsonb not null default '[]'::jsonb check (jsonb_typeof(hours) = 'array' and jsonb_array_length(hours) <= 7),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

drop trigger if exists store_settings_touch on public.store_settings;
create trigger store_settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- Promoções
-- ---------------------------------------------------------------
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 90),
  description text not null default '' check (char_length(description) <= 280),
  price_from_cents integer check (price_from_cents between 0 and 10000000),
  price_cents integer check (price_cents between 0 and 10000000),
  unit text not null default '' check (char_length(unit) <= 30),
  starts_at timestamptz,
  ends_at timestamptz,
  image_path text check (public.valid_image_path(image_path)),
  image_alt text not null default '' check (char_length(image_alt) <= 160),
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_price_lower check (price_from_cents is null or price_cents is null or price_cents < price_from_cents),
  constraint promo_dates check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create index if not exists promotions_public_idx on public.promotions (sort_order, created_at desc) where published;

drop trigger if exists promotions_touch on public.promotions;
create trigger promotions_touch before update on public.promotions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- Em alta
-- ---------------------------------------------------------------
create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 90),
  description text not null default '' check (char_length(description) <= 200),
  category text not null default '' check (char_length(category) <= 40),
  price_cents integer check (price_cents between 0 and 10000000),
  unit text not null default '' check (char_length(unit) <= 30),
  image_path text check (public.valid_image_path(image_path)),
  image_alt text not null default '' check (char_length(image_alt) <= 160),
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists highlights_public_idx on public.highlights (sort_order) where published;

drop trigger if exists highlights_touch on public.highlights;
create trigger highlights_touch before update on public.highlights
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- Novidades
-- ---------------------------------------------------------------
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 1500),
  published_at timestamptz not null default now(),
  image_path text check (public.valid_image_path(image_path)),
  image_alt text not null default '' check (char_length(image_alt) <= 160),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists news_public_idx on public.news (published_at desc) where published;

drop trigger if exists news_touch on public.news;
create trigger news_touch before update on public.news
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------
-- RLS: público lê só o publicado (e promoções dentro da validade)
-- ---------------------------------------------------------------
alter table public.store_settings enable row level security;
alter table public.promotions     enable row level security;
alter table public.highlights     enable row level security;
alter table public.news           enable row level security;
alter table public.store_settings force row level security;
alter table public.promotions     force row level security;
alter table public.highlights     force row level security;
alter table public.news           force row level security;

-- Leitura pública
drop policy if exists "settings_public_read" on public.store_settings;
create policy "settings_public_read" on public.store_settings
  for select to anon, authenticated using (true);

drop policy if exists "promotions_public_read" on public.promotions;
create policy "promotions_public_read" on public.promotions
  for select to anon, authenticated
  using (
    (published and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()))
    or (select public.is_admin())
  );

drop policy if exists "highlights_public_read" on public.highlights;
create policy "highlights_public_read" on public.highlights
  for select to anon, authenticated
  using (published or (select public.is_admin()));

drop policy if exists "news_public_read" on public.news;
create policy "news_public_read" on public.news
  for select to anon, authenticated
  using ((published and published_at <= now()) or (select public.is_admin()));

-- Escrita só para admin
drop policy if exists "settings_admin_update" on public.store_settings;
create policy "settings_admin_update" on public.store_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

do $$
declare t text;
begin
  foreach t in array array['promotions', 'highlights', 'news'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', t || '_admin_delete', t);
  end loop;
end $$;

-- Permissões mínimas por papel (RLS é a segunda barreira, não a única)
revoke all on public.admins, public.store_settings, public.promotions, public.highlights, public.news from anon, authenticated;
grant select on public.store_settings, public.promotions, public.highlights, public.news to anon, authenticated;
grant select on public.admins to authenticated;
grant update (name, tagline, about, street, number, district, city, state, zip, reference, latitude, longitude,
              phone, whatsapp, whatsapp_message, email, instagram, facebook, tiktok, hours, updated_by)
  on public.store_settings to authenticated;
grant insert, update, delete on public.promotions, public.highlights, public.news to authenticated;

-- Linha única de configurações
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- Storage: bucket público só de leitura, upload só para admin
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media_admin_insert" on storage.objects;
create policy "media_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_admin()) and public.valid_image_path(name));

drop policy if exists "media_admin_update" on storage.objects;
create policy "media_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (select public.is_admin()))
  with check (bucket_id = 'media' and (select public.is_admin()) and public.valid_image_path(name));

drop policy if exists "media_admin_delete" on storage.objects;
create policy "media_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (select public.is_admin()));

-- Bucket público serve arquivos pela URL pública sem precisar de policy de select.
-- Não criamos select para anon: assim ninguém lista o conteúdo do bucket.

commit;
