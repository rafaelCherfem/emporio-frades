-- Banners da vitrine (carrossel no topo do site).
-- O dono sobe as artes que ele mesmo cria; público só vê os publicados e dentro da validade.

begin;

-- Link do banner: vazio, âncora interna (#promocoes), telefone ou https.
create or replace function public.valid_banner_link(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p = ''
      or p ~ '^#[a-z0-9-]{1,40}$'
      or p ~ '^tel:\+\d{8,15}$'
      or (p ~ '^https://[^\s<>"'']+$' and char_length(p) <= 500);
$$;

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 90),
  image_path text not null check (public.valid_image_path(image_path)),
  image_mobile_path text check (public.valid_image_path(image_mobile_path)),
  image_alt text not null check (char_length(image_alt) between 1 and 200),
  link_url text not null default '' check (public.valid_banner_link(link_url)),
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0 check (sort_order between 0 and 9999),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint banner_dates check (starts_at is null or ends_at is null or starts_at <= ends_at)
);

create index if not exists banners_public_idx on public.banners (sort_order) where published;

drop trigger if exists banners_touch on public.banners;
create trigger banners_touch before update on public.banners
  for each row execute function public.touch_updated_at();

alter table public.banners enable row level security;
alter table public.banners force row level security;

drop policy if exists "banners_public_read" on public.banners;
create policy "banners_public_read" on public.banners
  for select to anon, authenticated
  using (
    (published and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()))
    or (select public.is_admin())
  );

drop policy if exists "banners_admin_insert" on public.banners;
create policy "banners_admin_insert" on public.banners
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "banners_admin_update" on public.banners;
create policy "banners_admin_update" on public.banners
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "banners_admin_delete" on public.banners;
create policy "banners_admin_delete" on public.banners
  for delete to authenticated using ((select public.is_admin()));

revoke all on public.banners from anon, authenticated;
grant select on public.banners to anon, authenticated;
grant insert, update, delete on public.banners to authenticated;

-- Banners são largos: aumenta o limite de arquivo do bucket para 3 MB
update storage.buckets set file_size_limit = 3145728 where id = 'media';

commit;
