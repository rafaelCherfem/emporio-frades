-- Datas especiais: feriados, dias fechados e horários diferentes.
-- O dono programa com antecedência; o site avisa sozinho alguns dias antes
-- e o "Aberto agora / Fechado" passa a respeitar a data.

begin;

create table if not exists public.special_days (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  title text not null check (char_length(title) between 1 and 60),
  closed boolean not null default true,
  open text not null default '09:00' check (open ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  close text not null default '13:00' check (close ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  note text not null default '' check (char_length(note) <= 160),
  -- quantos dias antes o site começa a avisar
  notice_days integer not null default 7 check (notice_days between 0 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint special_days_hours check (closed or open <> close)
);

drop trigger if exists special_days_touch on public.special_days;
create trigger special_days_touch before update on public.special_days
  for each row execute function public.touch_updated_at();

alter table public.special_days enable row level security;
alter table public.special_days force row level security;

-- Público vê só de ontem em diante (ontem ainda conta para expediente que passa da meia-noite)
drop policy if exists "special_days_public_read" on public.special_days;
create policy "special_days_public_read" on public.special_days
  for select to anon, authenticated
  using (
    date >= ((now() at time zone 'America/Sao_Paulo')::date - 1)
    or (select public.is_admin())
  );

drop policy if exists "special_days_admin_insert" on public.special_days;
create policy "special_days_admin_insert" on public.special_days
  for insert to authenticated with check ((select public.is_admin()));

drop policy if exists "special_days_admin_update" on public.special_days;
create policy "special_days_admin_update" on public.special_days
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "special_days_admin_delete" on public.special_days;
create policy "special_days_admin_delete" on public.special_days
  for delete to authenticated using ((select public.is_admin()));

revoke all on public.special_days from anon, authenticated;
grant select on public.special_days to anon, authenticated;
grant insert, update, delete on public.special_days to authenticated;

commit;
