import type { PublicConfig } from './config';
import {
  bannerSchema,
  highlightSchema,
  newsSchema,
  parseList,
  promotionSchema,
  storeSettingsSchema,
  type SiteContent,
} from './schemas';

/**
 * Leitura pública via REST do Supabase, sem SDK (menos bytes no site).
 * Tudo que chega passa pelos schemas; o que não passar é descartado.
 * Em qualquer falha, devolve null e a página mantém o conteúdo de reserva.
 */

const PROMO_COLS = 'id,title,description,price_from_cents,price_cents,unit,starts_at,ends_at,image_path,image_alt,sort_order,published';
const HL_COLS = 'id,name,description,category,price_cents,unit,image_path,image_alt,sort_order,published';
const NEWS_COLS = 'id,title,body,published_at,image_path,image_alt,published';
const BANNER_COLS = 'id,title,image_path,image_mobile_path,image_alt,link_url,starts_at,ends_at,sort_order,published';
const SETTINGS_COLS =
  'name,tagline,about,street,number,district,city,state,zip,reference,latitude,longitude,phone,whatsapp,whatsapp_message,email,instagram,facebook,tiktok,hours,updated_at';

async function getJson(cfg: PublicConfig, path: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: cfg.supabaseAnonKey!, Accept: 'application/json' },
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new Error('Resposta inesperada');
  return res.json();
}

export async function fetchContent(cfg: PublicConfig, timeoutMs = 6000): Promise<Partial<SiteContent> | null> {
  if (!cfg.enabled) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const [settings, promotions, highlights, news, banners] = await Promise.allSettled([
      getJson(cfg, `store_settings?select=${SETTINGS_COLS}&id=eq.1&limit=1`, ctrl.signal),
      getJson(cfg, `promotions?select=${PROMO_COLS}&order=sort_order.asc,created_at.desc&limit=24`, ctrl.signal),
      getJson(cfg, `highlights?select=${HL_COLS}&order=sort_order.asc&limit=24`, ctrl.signal),
      getJson(cfg, `news?select=${NEWS_COLS}&order=published_at.desc&limit=6`, ctrl.signal),
      getJson(cfg, `banners?select=${BANNER_COLS}&order=sort_order.asc&limit=8`, ctrl.signal),
    ]);

    const out: Partial<SiteContent> = {};
    if (settings.status === 'fulfilled' && Array.isArray(settings.value) && settings.value[0]) {
      const s = storeSettingsSchema.safeParse(settings.value[0]);
      if (s.success) out.settings = s.data;
    }
    if (promotions.status === 'fulfilled') out.promotions = parseList(promotionSchema, promotions.value);
    if (highlights.status === 'fulfilled') out.highlights = parseList(highlightSchema, highlights.value);
    if (news.status === 'fulfilled') out.news = parseList(newsSchema, news.value);
    if (banners.status === 'fulfilled') out.banners = parseList(bannerSchema, banners.value);

    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
