import type { Page, Route } from '@playwright/test';

/**
 * Supabase fictício para os testes e2e. Responde no mesmo formato da API real
 * (REST/PostgREST, Auth e Storage) e guarda o que o painel grava, para os testes
 * conferirem o que foi enviado.
 */

export const SB = 'https://test-project.supabase.co';
export const ADMIN_ID = '00000000-0000-4000-8000-00000000000a';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
function fakeJwt(sub: string) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', aud: 'authenticated', exp, email: 'dono@emporio.com' })}.c2ln`;
}

export interface FakeOptions {
  isAdmin?: boolean;
  password?: string;
  failRest?: boolean;
  promotions?: Record<string, unknown>[];
  highlights?: Record<string, unknown>[];
  news?: Record<string, unknown>[];
  settings?: Record<string, unknown>;
}

export interface FakeState {
  inserts: { table: string; body: Record<string, unknown> }[];
  updates: { table: string; body: Record<string, unknown>; query: string }[];
  uploads: { path: string; contentType: string; size: number }[];
  loginAttempts: number;
}

export const baseSettings = {
  name: 'Empório Frade’s',
  tagline: 'Frase vinda do banco.',
  about: 'Sobre vindo do banco.',
  street: 'Rua das Oliveiras',
  number: '45',
  district: 'Vila Nova',
  city: 'Campinas',
  state: 'SP',
  zip: '13000-000',
  reference: 'Esquina com a padaria',
  latitude: -22.9,
  longitude: -47.06,
  phone: '1933334444',
  whatsapp: '19987654321',
  whatsapp_message: 'Oi, vim pelo site',
  email: 'contato@emporiofrades.com.br',
  instagram: 'emporiofrades',
  facebook: '',
  tiktok: '',
  hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, closed: day === 0, open: '08:00', close: '20:00' })),
  updated_at: new Date().toISOString(),
};

export async function fakeSupabase(page: Page, opts: FakeOptions = {}): Promise<FakeState> {
  const state: FakeState = { inserts: [], updates: [], uploads: [], loginAttempts: 0 };
  const tables: Record<string, Record<string, unknown>[]> = {
    promotions: opts.promotions ?? [],
    highlights: opts.highlights ?? [],
    news: opts.news ?? [],
    store_settings: [{ id: 1, ...baseSettings, ...opts.settings }],
    admins: opts.isAdmin === false ? [] : [{ user_id: ADMIN_ID }],
  };

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' },
      body: JSON.stringify(body),
    });

  await page.route(`${SB}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    if (method === 'OPTIONS') return json(route, {});

    // ---------- Auth ----------
    if (url.pathname === '/auth/v1/token') {
      state.loginAttempts++;
      const body = req.postDataJSON() as { email?: string; password?: string };
      if (body.password !== (opts.password ?? 'senha-correta-123')) {
        return json(route, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      }
      return json(route, {
        access_token: fakeJwt(ADMIN_ID),
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'refresh-fake',
        user: { id: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: body.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
      });
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/auth/v1/recover') return json(route, {});
    if (url.pathname.startsWith('/auth/v1/')) return json(route, {});

    // ---------- Storage ----------
    if (url.pathname.startsWith('/storage/v1/object/media/')) {
      const path = url.pathname.replace('/storage/v1/object/media/', '');
      if (method === 'POST') {
        const buf = req.postDataBuffer() ?? Buffer.alloc(0);
        const header = req.headers()['content-type'] ?? '';
        // Blob vai como multipart: o tipo real fica dentro da parte do arquivo
        const partType = /Content-Type:\s*([^\r\n]+)/i.exec(buf.toString('latin1'))?.[1]?.trim();
        state.uploads.push({ path, contentType: header.startsWith('multipart/') ? (partType ?? '') : header, size: buf.length });
        return json(route, { Key: `media/${path}` });
      }
    }
    if (url.pathname.startsWith('/storage/v1/')) return json(route, []);

    // ---------- REST ----------
    if (url.pathname.startsWith('/rest/v1/')) {
      if (opts.failRest) return json(route, { message: 'erro' }, 503);
      const table = url.pathname.replace('/rest/v1/', '');
      const rows = tables[table];
      if (!rows) return json(route, { message: 'not found' }, 404);

      if (method === 'GET') {
        const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
        let out = rows;
        const uid = url.searchParams.get('user_id');
        if (uid) out = rows.filter((r) => `eq.${r['user_id']}` === uid);
        if (single) return out[0] ? json(route, out[0]) : json(route, null, 406);
        return json(route, out);
      }
      if (method === 'POST') {
        const body = req.postDataJSON() as Record<string, unknown>;
        state.inserts.push({ table, body });
        rows.push({ id: crypto.randomUUID(), ...body });
        return route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' } });
      }
      if (method === 'PATCH') {
        const body = req.postDataJSON() as Record<string, unknown>;
        state.updates.push({ table, body, query: url.search });
        const id = url.searchParams.get('id')?.replace('eq.', '');
        const row = rows.find((r) => String(r['id']) === id);
        if (row) Object.assign(row, body);
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.replace('eq.', '');
        tables[table] = rows.filter((r) => String(r['id']) !== id);
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
    }
    return json(route, { message: 'rota não simulada' }, 404);
  });

  return state;
}

export const promo = (over: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  title: 'Promo do banco',
  description: 'Descrição do banco',
  price_from_cents: 2000,
  price_cents: 1500,
  unit: 'un',
  starts_at: null,
  ends_at: null,
  image_path: null,
  image_alt: '',
  sort_order: 10,
  published: true,
  ...over,
});
