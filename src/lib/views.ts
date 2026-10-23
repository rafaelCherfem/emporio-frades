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
import type { Highlight, News, Promotion, StoreSettings } from './schemas';
import { h, type VNode } from './vnode';

/**
 * Componentes de conteúdo dinâmico. Cada função devolve VNodes, que viram
 * HTML no build (toHTML) e DOM no navegador (toDOM). Uma única fonte de marcação.
 */

export interface ViewEnv {
  supabaseUrl: string | undefined;
  now?: Date;
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

/* Em alta: cardápio agrupado por categoria */

export function highlightMenu(list: Highlight[], env: ViewEnv): VNode[] {
  const groups = new Map<string, Highlight[]>();
  for (const item of list.filter((i) => i.published)) {
    const key = item.category || 'Da casa';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].map(([category, items]) =>
    h(
      'li',
      { class: 'menu__group' },
      h('h3', { class: 'menu__category' }, category),
      h(
        'ul',
        { class: 'menu__items' },
        ...items.map((i) => {
          const price = formatBRL(i.price_cents);
          return h(
            'li',
            { class: 'menu__item', 'data-id': i.id },
            picture(i.image_path, i.image_alt, env, 'menu__photo', 160, 160),
            h(
              'div',
              { class: 'menu__line' },
              h('h4', { class: 'menu__name' }, i.name),
              h('span', { class: 'menu__leader', 'aria-hidden': 'true' }),
              price
                ? h(
                    'data',
                    { class: 'menu__price', value: (i.price_cents! / 100).toFixed(2) },
                    price,
                    i.unit ? h('small', {}, ` /${i.unit}`) : null,
                  )
                : null,
            ),
            i.description ? h('p', { class: 'menu__desc' }, i.description) : null,
          );
        }),
      ),
    ),
  );
}

/* Novidades: mural */

export function newsBoard(list: News[], env: ViewEnv): VNode[] {
  return list
    .filter((n) => n.published)
    .map((n) =>
      h(
        'li',
        { class: 'board__item', 'data-id': n.id },
        h(
          'article',
          {},
          h('time', { class: 'board__date', datetime: n.published_at }, formatDateLong(n.published_at)),
          h('h3', { class: 'board__title' }, n.title),
          n.body ? h('p', { class: 'board__text' }, n.body) : null,
          picture(n.image_path, n.image_alt, env, 'board__photo', 640, 420),
        ),
      ),
    );
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
