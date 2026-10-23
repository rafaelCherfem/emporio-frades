import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Testa a migração real num Postgres (PGlite) com stubs mínimos do que o
 * Supabase fornece: papéis anon/authenticated, auth.users, auth.uid() e storage.
 * Prova que as políticas de RLS fazem o que o plano promete.
 */

const ADMIN = '00000000-0000-0000-0000-00000000000a';
const INTRUSO = '00000000-0000-0000-0000-00000000000b';

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean,
    file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

let db: PGlite;

/** Executa SQL como um papel, opcionalmente com um usuário logado. */
async function as<T = Record<string, unknown>>(role: 'anon' | 'authenticated', userId: string | null, sql: string) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`);
  try {
    return await db.query<T>(sql);
  } finally {
    await db.exec('reset role;');
  }
}

async function denied(role: 'anon' | 'authenticated', userId: string | null, sql: string) {
  try {
    const r = await as(role, userId, sql);
    // Sem erro, mas sem efeito: RLS filtra linhas em select/update/delete
    if (/^\s*select/i.test(sql)) return r.rows.length === 0;
    return r.affectedRows === 0;
  } catch (e) {
    return /permission denied|row-level security|violates/i.test(String(e));
  }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUBS);
  // Todas as migrações, na ordem do nome (como o Supabase aplica)
  for (const f of readdirSync('supabase/migrations').filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8'));
  }
  await db.exec(`
    insert into auth.users values ('${ADMIN}', 'dono@emporio.com'), ('${INTRUSO}', 'curioso@x.com');
    insert into public.admins (user_id) values ('${ADMIN}');
    insert into public.promotions (title, published, price_from_cents, price_cents) values
      ('Publicada', true, 1000, 800),
      ('Rascunho', false, null, null);
    insert into public.promotions (title, published, ends_at) values ('Vencida', true, now() - interval '1 day');
    insert into public.promotions (title, published, starts_at) values ('Futura', true, now() + interval '1 day');
    insert into public.highlights (name, published) values ('Pão', true), ('Escondido', false);
    insert into public.news (title, published) values ('Nova', true), ('Rascunho', false);
    insert into public.banners (title, image_path, image_alt, published) values
      ('Banner no ar', 'banners/2026/a.webp', 'Espumantes', true),
      ('Banner rascunho', 'banners/2026/b.webp', 'Rascunho', false);
    insert into public.banners (title, image_path, image_alt, published, ends_at) values
      ('Banner vencido', 'banners/2026/c.webp', 'Vencido', true, now() - interval '1 day');
  `);
}, 60_000);

describe('leitura pública (anon)', () => {
  it('vê só promoções publicadas e dentro da validade', async () => {
    const r = await as<{ title: string }>('anon', null, 'select title from public.promotions order by title');
    expect(r.rows.map((x) => x.title)).toEqual(['Publicada']);
  });

  it('não vê destaques e novidades em rascunho', async () => {
    const h = await as<{ name: string }>('anon', null, 'select name from public.highlights');
    expect(h.rows.map((x) => x.name)).toEqual(['Pão']);
    const n = await as<{ title: string }>('anon', null, 'select title from public.news');
    expect(n.rows.map((x) => x.title)).toEqual(['Nova']);
  });

  it('lê as configurações da loja', async () => {
    const r = await as('anon', null, 'select name from public.store_settings');
    expect(r.rows).toHaveLength(1);
  });

  it('não lê a tabela de admins', async () => {
    expect(await denied('anon', null, 'select * from public.admins')).toBe(true);
  });
});

describe('escrita bloqueada para anon', () => {
  it.each([
    "insert into public.promotions (title, published) values ('hack', true)",
    "update public.promotions set title = 'hack'",
    'delete from public.promotions',
    "update public.store_settings set whatsapp = '11999999999'",
    "insert into public.admins (user_id) values ('00000000-0000-0000-0000-00000000000c')",
    "insert into public.news (title, published) values ('hack', true)",
    "insert into storage.objects (bucket_id, name) values ('media', 'x.png')",
  ])('%s', async (sql) => {
    expect(await denied('anon', null, sql)).toBe(true);
  });
});

describe('usuário logado que NÃO é admin', () => {
  it('não vê rascunhos', async () => {
    const r = await as('authenticated', INTRUSO, 'select * from public.promotions');
    expect(r.rows).toHaveLength(1);
  });

  it.each([
    "insert into public.promotions (title, published) values ('hack', true)",
    "update public.promotions set title = 'hack'",
    'delete from public.highlights',
    "update public.store_settings set whatsapp = '11999999999'",
    `insert into public.admins (user_id) values ('${INTRUSO}')`,
    "insert into storage.objects (bucket_id, name) values ('media', 'x.png')",
  ])('bloqueado: %s', async (sql) => {
    expect(await denied('authenticated', INTRUSO, sql)).toBe(true);
  });

  it('não consegue se promover a admin nem ver quem é admin', async () => {
    const r = await as('authenticated', INTRUSO, 'select * from public.admins');
    expect(r.rows).toHaveLength(0);
    const ok = await as<{ is_admin: boolean }>('authenticated', INTRUSO, 'select public.is_admin()');
    expect(ok.rows[0]!.is_admin).toBe(false);
  });
});

describe('admin', () => {
  it('vê rascunhos, vencidas e futuras', async () => {
    const r = await as('authenticated', ADMIN, 'select * from public.promotions');
    expect(r.rows).toHaveLength(4);
  });

  it('cria, edita e apaga', async () => {
    const ins = await as<{ id: string }>(
      'authenticated',
      ADMIN,
      "insert into public.promotions (title, published) values ('Nova promo', true) returning id",
    );
    const id = ins.rows[0]!.id;
    const up = await as('authenticated', ADMIN, `update public.promotions set title = 'Editada' where id = '${id}'`);
    expect(up.affectedRows).toBe(1);
    const del = await as('authenticated', ADMIN, `delete from public.promotions where id = '${id}'`);
    expect(del.affectedRows).toBe(1);
  });

  it('atualiza os dados da loja e o updated_at muda', async () => {
    const before = await db.query<{ updated_at: string }>('select updated_at from public.store_settings');
    await new Promise((r) => setTimeout(r, 5));
    const r = await as('authenticated', ADMIN, "update public.store_settings set whatsapp = '11912345678'");
    expect(r.affectedRows).toBe(1);
    const after = await db.query<{ updated_at: string }>('select updated_at from public.store_settings');
    expect(after.rows[0]!.updated_at).not.toEqual(before.rows[0]!.updated_at);
  });

  it('não consegue mudar o id da linha única nem se auto-gerenciar como admin', async () => {
    expect(await denied('authenticated', ADMIN, 'update public.store_settings set id = 2')).toBe(true);
    expect(await denied('authenticated', ADMIN, `insert into public.admins (user_id) values ('${INTRUSO}')`)).toBe(true);
  });

  it('upload no bucket só com caminho válido', async () => {
    const ok = await as('authenticated', ADMIN, "insert into storage.objects (bucket_id, name) values ('media', 'promocoes/a-1.webp')");
    expect(ok.affectedRows).toBe(1);
    expect(await denied('authenticated', ADMIN, "insert into storage.objects (bucket_id, name) values ('media', '../x.webp')")).toBe(true);
    expect(await denied('authenticated', ADMIN, "insert into storage.objects (bucket_id, name) values ('media', 'x.svg')")).toBe(true);
    expect(await denied('authenticated', ADMIN, "insert into storage.objects (bucket_id, name) values ('outro', 'x.webp')")).toBe(true);
  });
});

describe('controle positivo do helper', () => {
  it('operações válidas do admin NÃO são reportadas como negadas', async () => {
    expect(await denied('authenticated', ADMIN, "insert into public.promotions (title) values ('controle')")).toBe(false);
    expect(await denied('authenticated', ADMIN, "update public.store_settings set state = 'MG'")).toBe(false);
    expect(await denied('anon', null, 'select 1 from public.promotions')).toBe(false);
  });
});

describe('banners', () => {
  it('visitante vê só o banner publicado e dentro da validade', async () => {
    const r = await as<{ title: string }>('anon', null, 'select title from public.banners order by title');
    expect(r.rows.map((x) => x.title)).toEqual(['Banner no ar']);
  });

  it.each([
    ['anon', null],
    ['authenticated', INTRUSO],
  ] as const)('%s não cria nem altera banners', async (role, uid) => {
    expect(await denied(role, uid, "insert into public.banners (title, image_path, image_alt, published) values ('x', 'banners/x.webp', 'x', true)")).toBe(true);
    expect(await denied(role, uid, "update public.banners set published = true")).toBe(true);
    expect(await denied(role, uid, 'delete from public.banners')).toBe(true);
  });

  it('admin cria banner com link interno, telefone ou https', async () => {
    for (const link of ['#promocoes', 'tel:+551135429564', 'https://www.instagram.com/emporiofrades_/', '']) {
      expect(await denied('authenticated', ADMIN, `insert into public.banners (title, image_path, image_alt, link_url) values ('ok', 'banners/ok.webp', 'ok', '${link}')`)).toBe(false);
    }
  });

  it.each([
    ["link_url) values ('x', 'banners/x.webp', 'x', 'javascript:alert(1)')", 'link javascript:'],
    ["link_url) values ('x', 'banners/x.webp', 'x', 'http://site.com')", 'link sem https'],
    [`link_url) values ('x', 'banners/x.webp', 'x', 'https://a.com/"><script>')`, 'link com aspas e tags'],
    ["link_url) values ('x', 'https://evil.com/a.png', 'x', '')", 'imagem externa'],
    ["link_url) values ('x', 'banners/x.webp', '', '')", 'sem descrição da imagem'],
  ])('recusa %s (%s)', async (values) => {
    expect(await denied('authenticated', ADMIN, `insert into public.banners (title, image_path, image_alt, ${values}`)).toBe(true);
  });
});

describe('constraints do banco (mesmo para admin)', () => {
  it.each([
    ["promotions (title) values ('')", 'título vazio'],
    [`promotions (title) values ('${'x'.repeat(91)}')`, 'título longo'],
    ["promotions (title, price_from_cents, price_cents) values ('x', 100, 200)", 'preço por maior que de'],
    ["promotions (title, price_cents) values ('x', -1)", 'preço negativo'],
    ["promotions (title, image_path) values ('x', 'javascript:alert(1)')", 'imagem com esquema'],
    ["promotions (title, image_path) values ('x', 'https://evil.com/a.png')", 'imagem externa'],
    ["promotions (title, starts_at, ends_at) values ('x', now(), now() - interval '1 day')", 'datas invertidas'],
  ])('recusa %s (%s)', async (values) => {
    expect(await denied('authenticated', ADMIN, `insert into public.${values}`)).toBe(true);
  });

  it.each([
    ["whatsapp = 'abc'", 'whatsapp com letras'],
    ["email = 'x@y.com\nBcc: z@w.com'", 'e-mail com quebra de linha'],
    ["state = 'sao paulo'", 'UF inválida'],
    ["hours = '{}'::jsonb", 'horários fora do formato'],
  ])('recusa store_settings %s (%s)', async (set) => {
    expect(await denied('authenticated', ADMIN, `update public.store_settings set ${set}`)).toBe(true);
  });
});
