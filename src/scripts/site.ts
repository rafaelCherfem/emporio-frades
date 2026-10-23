import { fetchContent } from '../lib/api';
import { readConfig } from '../lib/config';
import { openStatus } from '../lib/hours';
import { mapEmbedSrc } from '../lib/safe';
import {
  highlightSchema,
  newsSchema,
  parseList,
  promotionSchema,
  storeSettingsSchema,
  type SiteContent,
  type StoreSettings,
} from '../lib/schemas';
import {
  addressLines,
  contactLinks,
  highlightMenu,
  hoursList,
  newsBoard,
  promotionList,
  socialList,
  type ContactLinks,
} from '../lib/views';
import { mount } from '../lib/vnode';
import { initMotion, refreshMotion } from './motion';

const cfg = readConfig();
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

/**
 * Conteúdo com que o HTML foi gerado (bloco application/json na página).
 * Revalidado aqui: o navegador nunca confia em dado sem passar pelo schema.
 */
function readInitial(): SiteContent | null {
  try {
    const raw = JSON.parse($('#initial-content')?.textContent ?? 'null') as Partial<Record<keyof SiteContent, unknown>> | null;
    const settings = storeSettingsSchema.safeParse(raw?.settings);
    if (!settings.success) return null;
    return {
      settings: settings.data,
      promotions: parseList(promotionSchema, raw?.promotions),
      highlights: parseList(highlightSchema, raw?.highlights),
      news: parseList(newsSchema, raw?.news),
    };
  } catch {
    return null;
  }
}

let content: SiteContent | null = readInitial();

/* ---------- Dados da loja ---------- */

function applySettings(s: StoreSettings) {
  const links = contactLinks(s);
  const [a1 = '', a2 = ''] = addressLines(s);
  const texts: Record<string, string> = {
    name: s.name,
    tagline: s.tagline,
    about: s.about,
    reference: s.reference,
    address1: a1,
    address2: a2,
  };

  for (const el of $$('[data-bind]')) {
    const key = el.dataset['bind']!;
    if (key in texts) {
      el.textContent = texts[key]!;
      if (key === 'reference' || key === 'about' || key === 'tagline') el.hidden = !texts[key];
    }
  }

  const labels: Record<string, string | null> = {
    phone: links.phoneLabel,
    whatsapp: links.whatsappLabel,
    email: links.emailLabel,
  };
  for (const el of $$('[data-label]')) {
    el.textContent = labels[el.dataset['label']!] ?? '';
  }

  for (const el of $$<HTMLAnchorElement>('a[data-link]')) {
    const key = el.dataset['link'] as keyof ContactLinks;
    const href = links[key];
    // Botões "Ligar" com data-fallback só aparecem quando não há WhatsApp
    const isFallback = el.hasAttribute('data-fallback');
    if (typeof href === 'string' && href && !(isFallback && links.whatsapp)) {
      el.href = href;
      el.hidden = false;
      if (href.startsWith('https://')) {
        el.target = '_blank';
        el.rel = 'noopener noreferrer';
      }
    } else {
      el.removeAttribute('href');
      el.hidden = true;
    }
  }
  const sep = $('[data-link-sep]');
  if (sep) sep.hidden = !links.phone || !links.instagram;

  const social = $('[data-list="social"]');
  if (social) mount(social, socialList(s));

  renderHours(s);
  renderStatus(s);
}

function renderHours(s: StoreSettings) {
  const list = $('[data-list="hours"]');
  if (list) mount(list, hoursList(s, { supabaseUrl: cfg.supabaseUrl, now: new Date() }));
}

function renderStatus(s: StoreSettings) {
  const el = $('[data-status]');
  if (!el) return;
  const st = openStatus(s.hours);
  el.textContent = st.label;
  el.dataset['state'] = st.open ? 'open' : 'closed';
  el.hidden = false;
}

/* ---------- Listas ---------- */

function renderLists(c: SiteContent) {
  const env = { supabaseUrl: cfg.supabaseUrl, now: new Date() };

  const promos = promotionList(c.promotions, env);
  const promoList = $('[data-list="promotions"]');
  if (promoList) mount(promoList, promos);
  const count = $('[data-promo-count]');
  if (count) {
    count.textContent = promos.length === 1 ? '1 oferta' : `${promos.length} ofertas`;
    count.hidden = promos.length === 0;
  }
  const rail = $('[data-rail]');
  if (rail) rail.hidden = promos.length === 0;
  const empty = $('[data-promo-empty]');
  if (empty) empty.hidden = promos.length > 0;

  // Seções sem conteúdo somem (em vez de mostrar um bloco vazio)
  const hl = highlightMenu(c.highlights, env);
  const hlList = $('[data-list="highlights"]');
  if (hlList) mount(hlList, hl);
  const hot = $('[data-hot]');
  if (hot) hot.hidden = hl.length === 0;

  const news = newsBoard(c.news, env);
  const newsList = $('[data-list="news"]');
  if (newsList) mount(newsList, news);
  const newsSection = $('[data-news]');
  if (newsSection) newsSection.hidden = news.length === 0;

  syncNav();
}

/** Menu só mostra links para seções visíveis. */
function syncNav() {
  for (const a of $$<HTMLAnchorElement>('.nav__list a')) {
    const target = document.getElementById(a.hash.slice(1));
    const li = a.closest('li');
    if (li && target) li.hidden = target.hidden;
  }
}

/* ---------- Interface ---------- */

function initNav() {
  const toggle = $<HTMLButtonElement>('[data-nav-toggle]');
  const nav = $('[data-nav]');
  if (!toggle || !nav) return;

  const set = (open: boolean) => {
    toggle.setAttribute('aria-expanded', String(open));
    nav.dataset['open'] = String(open);
  };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => {
    if ((e.target as Element).closest('a')) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      set(false);
      toggle.focus();
    }
  });
}

function initHeaderState() {
  const header = $('[data-header]');
  const hero = $('#topo');
  if (!header || !hero) return;
  const io = new IntersectionObserver(
    ([entry]) => {
      const past = !entry!.isIntersecting;
      header.dataset['scrolled'] = String(past);
      for (const f of $$('[data-float-cta]')) f.dataset['visible'] = String(past);
    },
    { rootMargin: '-80px 0px 0px 0px' },
  );
  io.observe(hero);

  // Destaca no menu a seção visível
  const links = new Map($$<HTMLAnchorElement>('.nav__list a').map((a) => [a.hash.slice(1), a]));
  const sections = [...links.keys()].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
  const spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const a = links.get(e.target.id);
        if (a && e.isIntersecting) {
          links.forEach((l) => l.removeAttribute('aria-current'));
          a.setAttribute('aria-current', 'true');
        }
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  sections.forEach((s) => spy.observe(s));
}

function initMap() {
  const btn = $<HTMLButtonElement>('[data-map-load]');
  const box = $('[data-map]');
  if (!btn || !box) return;
  btn.addEventListener('click', () => {
    if (!content) return;
    const s = content.settings;
    const iframe = document.createElement('iframe');
    iframe.src = mapEmbedSrc(s.latitude, s.longitude, `${s.name}, ${addressLines(s).join(', ')}`);
    iframe.title = `Mapa com a localização do ${s.name}`;
    iframe.loading = 'lazy';
    iframe.referrerPolicy = 'no-referrer-when-downgrade';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    box.replaceChildren(iframe);
    iframe.focus();
  });
}

/* ---------- Início ---------- */

export async function initSite() {
  document.documentElement.classList.add('js');
  initNav();
  initHeaderState();
  initMap();
  if (content) {
    renderStatus(content.settings);
    renderHours(content.settings);
    // Reaplica as listas com a data de AGORA: some o que venceu desde o build
    renderLists(content);
  }
  initMotion();

  setInterval(() => content && renderStatus(content.settings), 60_000);

  const live = await fetchContent(cfg);
  if (!live || !content) return;
  content = {
    settings: live.settings ?? content.settings,
    promotions: live.promotions ?? content.promotions,
    highlights: live.highlights ?? content.highlights,
    news: live.news ?? content.news,
  };
  applySettings(content.settings);
  renderLists(content);
  refreshMotion();
}
