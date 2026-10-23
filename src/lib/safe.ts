/**
 * Validadores de tudo que vira link ou endereço de imagem na página.
 * Regra: qualquer valor que veio do banco passa por aqui antes de virar href/src.
 * Se não passar, o elemento simplesmente não é exibido.
 */

const MAX_URL = 2048;

/** Aceita somente URLs https absolutas, sem credenciais embutidas. */
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > MAX_URL) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/** Mantém só dígitos. */
export function onlyDigits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D+/g, '') : '';
}

/**
 * Telefone brasileiro normalizado com DDI 55.
 * Aceita 10 ou 11 dígitos (DDD + número) ou 12/13 já com 55.
 */
export function normalizeBrPhone(value: unknown): string | null {
  let d = onlyDigits(value);
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (!/^55\d{10,11}$/.test(d)) return null;
  const ddd = Number(d.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;
  return d;
}

export function telHref(value: unknown): string | null {
  const d = normalizeBrPhone(value);
  return d ? `tel:+${d}` : null;
}

/** Link do WhatsApp com mensagem pronta (texto sempre codificado). */
export function whatsappHref(value: unknown, message?: string | null): string | null {
  const d = normalizeBrPhone(value);
  if (!d) return null;
  const text = (message ?? '').trim().slice(0, 500);
  return text ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : `https://wa.me/${d}`;
}

/** Exibe telefone no formato (11) 91234-5678. */
export function formatBrPhone(value: unknown): string | null {
  const d = normalizeBrPhone(value);
  if (!d) return null;
  const ddd = d.slice(2, 4);
  const num = d.slice(4);
  return num.length === 9
    ? `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`
    : `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
}

const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;

export function mailtoHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length > 254 || !EMAIL_RE.test(v)) return null;
  return `mailto:${v}`;
}

/** Usuário de rede social: letras, números, ponto e sublinhado. Aceita com ou sem @ ou URL colada. */
const HANDLE_RE = /^[a-z0-9._]{1,30}$/i;

function extractHandle(value: unknown, hosts: string[]): string | null {
  if (typeof value !== 'string') return null;
  let v = value.trim();
  if (!v) return null;
  const asUrl = safeHttpsUrl(v.startsWith('http') ? v : '');
  if (asUrl) {
    const u = new URL(asUrl);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (!hosts.includes(host)) return null;
    v = u.pathname.split('/').filter(Boolean)[0] ?? '';
  }
  v = v.replace(/^@/, '');
  return HANDLE_RE.test(v) ? v : null;
}

export function instagramHref(value: unknown): string | null {
  const h = extractHandle(value, ['instagram.com']);
  return h ? `https://www.instagram.com/${h}/` : null;
}

export function tiktokHref(value: unknown): string | null {
  const h = extractHandle(value, ['tiktok.com']);
  return h ? `https://www.tiktok.com/@${h}` : null;
}

export function facebookHref(value: unknown): string | null {
  const h = extractHandle(value, ['facebook.com', 'fb.com']);
  return h ? `https://www.facebook.com/${h}` : null;
}

/** Caminho de imagem no bucket: só minúsculas, números, barra, hífen e sublinhado. */
const IMAGE_PATH_RE = /^(?!.*\.\.)[a-z0-9][a-z0-9/_-]{0,180}\.(?:jpe?g|png|webp|avif)$/;

export function isSafeImagePath(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_PATH_RE.test(value);
}

/** Monta a URL pública da imagem. Fotos locais (seed) começam com /media/. */
export function imageUrl(path: unknown, supabaseUrl: string | undefined): string | null {
  if (typeof path === 'string' && /^\/media\/[a-z0-9/_-]+\.(?:jpe?g|png|webp|avif|svg)$/.test(path)) {
    return path;
  }
  if (!isSafeImagePath(path)) return null;
  const base = safeHttpsUrl(supabaseUrl);
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/media/${path}`;
}

export function mapsSearchHref(lat: number | null, lng: number | null, address: string): string {
  const q = lat != null && lng != null ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function wazeHref(lat: number | null, lng: number | null, address: string): string {
  return lat != null && lng != null
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

export function mapEmbedSrc(lat: number | null, lng: number | null, address: string): string {
  const q = lat != null && lng != null ? `${lat},${lng}` : address;
  return `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=17&output=embed`;
}
