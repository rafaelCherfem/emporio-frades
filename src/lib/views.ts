import { formatBRL, formatDateLong, isPromotionActive, splitPrice, validityLabel } from './format';
import { groupHours, storeClock } from './hours';
import {
  facebookHref,
  formatBrPhone,
  imageUrl,
  instagramHref,
  mailtoHref,
  mapsSearchHref,
  telHref,
  tiktokHref,
  wazeHref,
  whatsappHref,
} from './safe';
import { asset } from './paths';
import type { Banner, Highlight, News, Promotion, StoreSettings } from './schemas';
import { h, type VNode } from './vnode';

/**
 * Componentes de conteúdo dinâmico. Cada função devolve VNodes, que viram
 * HTML no build (toHTML) e DOM no navegador (toDOM). Uma única fonte de marcação.
 */

export interface ViewEnv {
  supabaseUrl: string | undefined;
  now?: Date;
  /** Link do botão "Reservar" dos produtos (telefone ou WhatsApp da loja) */
  reserveHref?: string | null;
}

function picture(path: string | null, alt: string, env: ViewEnv, cls: string, w: number, hgt: number) {
  const src = imageUrl(path, env.supabaseUrl);
  if (!src) return null;
  return h(
    'figure',
    { class: cls },
    h('img', { src, alt: alt || '', loading: 'lazy', decoding: 'async', width: w, height: hgt }),
  );
}

/* Promoções: etiquetas de gôndola */

export function promotionTag(p: Promotion, env: ViewEnv): VNode {
  const validity = validityLabel(p.starts_at, p.ends_at, env.now);
  const unit = p.unit ? `/${p.unit}` : '';
  let price: VNode | null = null;
  if (p.price_cents != null) {
    const { whole, fraction } = splitPrice(p.price_cents);
    price = h(
      'p',
      { class: 'tag__price' },
      p.price_from_cents != null
        ? h('s', { class: 'tag__from' }, h('span', { class: 'sr-only' }, 'De '), formatBRL(p.price_from_cents)!)
        : null,
      h(
        'span',
        { class: 'tag__now' },
        h('span', { class: 'sr-only' }, p.price_from_cents != null ? 'por ' : 'Preço: '),
        h('span', { class: 'tag__cur' }, 'R$'),
        h('span', { class: 'tag__whole' }, whole),
        h('span', { class: 'tag__cents' }, `,${fraction}`),
        unit ? h('span', { class: 'tag__unit' }, unit) : null,
      ),
    );
  }
  const pct =
    p.price_from_cents && p.price_cents != null
      ? Math.round((1 - p.price_cents / p.price_from_cents) * 100)
      : null;

  return h(
    'li',
    { class: 'tag', 'data-id': p.id },
    h(
      'article',
      { class: 'tag__body' },
      picture(p.image_path, p.image_alt, env, 'tag__photo', 480, 360),
      h(
        'div',
        { class: 'tag__head' },
        pct && pct >= 5 ? h('span', { class: 'tag__off' }, `-${pct}%`) : null,
        validity ? h('span', { class: 'tag__validity' }, validity) : null,
      ),
      h('h3', { class: 'tag__title' }, p.title),
      p.description ? h('p', { class: 'tag__desc' }, p.description) : null,
      price,
    ),
  );
}

export function promotionList(list: Promotion[], env: ViewEnv): VNode[] {
  return list.filter((p) => isPromotionActive(p, env.now)).map((p) => promotionTag(p, env));
}

/* Imagem reserva: escolhe a garrafa (estilo foto de vitrine) pelo nome/categoria do item */

const ILLUSTRATIONS: [RegExp, string][] = [
  [/espumante|prosecco|champa(gne|nhe)|cava\b|brut|moscatel/, 'espumante'],
  [/ros[eé](?![a-z])|rosado/, 'rose'],
  [/branco|chardonnay|sauvignon|riesling|alvarinho|moscato|verde/, 'branco'],
  [/cerveja|ipa\b|lager|chop|pilsen|weiss|stout|trigo|ale\b/, 'cerveja'],
  [/whisk|u[ií]sque|bourbon|conhaque|rum\b|cacha[çc]a|brandy/, 'whisky'],
  [/\bgin\b|vodka|t[oô]nica|tequila|licor|destilado|aperitivo/, 'gin'],
  [/ta[çc]a|copo|acess[oó]rio|saca-rolha|decanter/, 'taca'],
  [/presente|kit|cesta|caixa|encomenda/, 'presente'],
  [/tinto|vinho|malbec|cabernet|merlot|carm[eé]n[eè]re|pinot|syrah|tannat/, 'tinto'],
];

export function illustrationFor(...texts: (string | null | undefined)[]): string {
  // O nome/título manda; o texto só decide se o título não disser nada
  let hit: [RegExp, string] | undefined;
  for (const text of texts) {
    const t = (text ?? '').toLowerCase();
    hit = t ? ILLUSTRATIONS.find(([re]) => re.test(t)) : undefined;
    if (hit) break;
  }
  return asset(`media/garrafas/${hit ? hit[1] : 'tinto'}.webp`);
}

/** Foto do item (Supabase) ou a ilustração correspondente. */
function mediaFor(path: string | null, alt: string, env: ViewEnv, fallbackTexts: string[], cls: string) {
  const photo = imageUrl(path, env.supabaseUrl);
  return h(
    'figure',
    { class: `${cls}${photo ? '' : ` ${cls}--illustration`}` },
    h('img', {
      src: photo ?? illustrationFor(...fallbackTexts),
      alt: photo ? alt || '' : '',
      loading: 'lazy',
      decoding: 'async',
      width: photo ? 320 : 280,
      height: photo ? 400 : 500,
    }),
  );
}

/* Mais procurados: cards de produto (foto da garrafa, nome, preço, reservar) */

export function productCards(list: Highlight[], env: ViewEnv): VNode[] {
  return list
    .filter((i) => i.published)
    .map((i) => {
      const price = formatBRL(i.price_cents);
      return h(
        'li',
        { class: 'product', 'data-id': i.id },
        h(
          'article',
          { class: 'product__card' },
          mediaFor(i.image_path, i.image_alt, env, [i.name, i.category, i.description], 'product__media'),
          h(
            'div',
            { class: 'product__body' },
            i.category ? h('p', { class: 'product__cat' }, i.category) : null,
            h('h3', { class: 'product__name' }, i.name),
            i.description ? h('p', { class: 'product__desc' }, i.description) : null,
            h(
              'div',
              { class: 'product__buy' },
              price
                ? h(
                    'data',
                    { class: 'product__price', value: (i.price_cents! / 100).toFixed(2) },
                    price,
                    i.unit ? h('small', {}, ` /${i.unit}`) : null,
                  )
                : h('span', { class: 'product__price product__price--ask' }, 'Consulte'),
              env.reserveHref
                ? h('a', { class: 'product__cta', href: env.reserveHref, 'aria-label': `Reservar ${i.name}` }, 'Reservar')
                : null,
            ),
          ),
        ),
      );
    });
}

/* Novidades: cards com imagem */

export function newsCards(list: News[], env: ViewEnv): VNode[] {
  return list
    .filter((n) => n.published)
    .map((n) =>
      h(
        'li',
        { class: 'news-card', 'data-id': n.id },
        h(
          'article',
          { class: 'news-card__inner' },
          mediaFor(n.image_path, n.image_alt, env, [n.title, n.body], 'news-card__media'),
          h(
            'div',
            { class: 'news-card__body' },
            h('time', { class: 'news-card__date', datetime: n.published_at }, formatDateLong(n.published_at)),
            h('h3', { class: 'news-card__title' }, n.title),
            n.body ? h('p', { class: 'news-card__text' }, n.body) : null,
          ),
        ),
      ),
    );
}

/* Banners do dono (vitrine) */

const BANNER_LINK = /^$|^#[a-z0-9-]{1,40}$|^tel:\+\d{8,15}$|^https:\/\/[^\s<>"']+$/;

export function bannerSlides(list: Banner[], env: ViewEnv): VNode[] {
  const now = env.now ?? new Date();
  const active = list.filter(
    (b) =>
      b.published &&
      (!b.starts_at || new Date(b.starts_at) <= now) &&
      (!b.ends_at || new Date(b.ends_at) >= now) &&
      imageUrl(b.image_path, env.supabaseUrl),
  );
  return active.map((b, i) => {
    const src = imageUrl(b.image_path, env.supabaseUrl)!;
    const mobile = imageUrl(b.image_mobile_path, env.supabaseUrl);
    const pic = h(
      'picture',
      { class: 'slide__media' },
      mobile ? h('source', { media: '(max-width: 700px)', srcset: mobile }) : null,
      h('img', {
        src,
        alt: b.image_alt,
        width: 1920,
        height: 720,
        decoding: 'async',
        loading: i === 0 ? null : 'lazy',
        fetchpriority: i === 0 ? 'high' : null,
      }),
    );
    const link = BANNER_LINK.test(b.link_url) && b.link_url ? b.link_url : null;
    return h(
      'div',
      { class: 'slide slide--image', 'data-slide': '', 'data-id': b.id },
      link ? h('a', { class: 'slide__link', href: link }, pic) : pic,
    );
  });
}

/* Horários, com o dia de hoje marcado */

export function hoursList(s: StoreSettings, env: ViewEnv): VNode[] {
  const today = env.now ? storeClock(env.now).day : -1;
  return groupHours(s.hours).map((g) =>
    h(
      'li',
      { class: 'hours__row', 'data-today': g.includes.includes(today) ? 'true' : null },
      h('span', { class: 'hours__days' }, g.days),
      h('span', { class: 'hours__time' }, g.time),
    ),
  );
}

/* Endereço */

export function addressLines(s: StoreSettings): string[] {
  const line1 = [s.street, s.number].filter(Boolean).join(', ');
  const line2 = [s.district, [s.city, s.state].filter(Boolean).join(' – ')].filter(Boolean).join(', ');
  return [line1, line2, s.zip ? `CEP ${s.zip}` : ''].filter(Boolean);
}

export function fullAddress(s: StoreSettings): string {
  return addressLines(s).join(', ');
}

/* Links de contato já validados */

export interface ContactLinks {
  whatsapp: string | null;
  whatsappLabel: string | null;
  phone: string | null;
  phoneLabel: string | null;
  email: string | null;
  emailLabel: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  maps: string;
  waze: string;
}

export function contactLinks(s: StoreSettings): ContactLinks {
  const addr = fullAddress(s);
  return {
    whatsapp: whatsappHref(s.whatsapp, s.whatsapp_message),
    whatsappLabel: formatBrPhone(s.whatsapp),
    phone: telHref(s.phone),
    phoneLabel: formatBrPhone(s.phone),
    email: mailtoHref(s.email),
    emailLabel: s.email || null,
    instagram: instagramHref(s.instagram),
    facebook: facebookHref(s.facebook),
    tiktok: tiktokHref(s.tiktok),
    maps: mapsSearchHref(s.latitude, s.longitude, `${s.name}, ${addr}`),
    waze: wazeHref(s.latitude, s.longitude, addr),
  };
}

export function socialList(s: StoreSettings): VNode[] {
  const c = contactLinks(s);
  const items: [string, string | null][] = [
    ['Instagram', c.instagram],
    ['Facebook', c.facebook],
    ['TikTok', c.tiktok],
  ];
  return items
    .filter((i): i is [string, string] => Boolean(i[1]))
    .map(([label, href]) => h('li', {}, h('a', { href, class: 'social__link' }, label)));
}
