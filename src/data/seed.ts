import type { SiteContent, StoreSettings } from '../lib/schemas';

/**
 * Dados reais da loja. Usados no HTML gerado no build e como reserva quando o
 * banco não responde. Depois de configurado o Supabase, o dono edita tudo pelo
 * painel; mantenha este arquivo atualizado só como rede de segurança.
 */
export const storeSettings: StoreSettings = {
  name: 'Empório Frade’s',
  tagline: 'Vinhos, espumantes, cervejas especiais e destilados na Avenida do Cursino, com a prateleira cheia e gente que entende do assunto.',
  about:
    'Um empório de bairro na Vila da Saúde, com rótulos do mundo inteiro: tintos, brancos e rosés, espumantes para brindar, cervejas especiais, destilados, taças e acessórios. Passe para conhecer ou ligue para saber se temos o que você procura.',
  street: 'Av. do Cursino',
  number: '129',
  district: 'Vila da Saúde',
  city: 'São Paulo',
  state: 'SP',
  zip: '04133-000',
  reference: '',
  latitude: -23.6037774,
  longitude: -46.6153218,
  phone: '1135429564',
  whatsapp: '',
  whatsapp_message: '',
  email: '',
  instagram: 'emporiofrades_',
  facebook: '',
  tiktok: '',
  hours: [
    { day: 0, closed: true, open: '09:00', close: '18:00' },
    { day: 1, closed: false, open: '09:00', close: '19:00' },
    { day: 2, closed: false, open: '09:00', close: '19:00' },
    { day: 3, closed: false, open: '09:00', close: '19:00' },
    { day: 4, closed: false, open: '09:00', close: '19:00' },
    { day: 5, closed: false, open: '09:00', close: '19:00' },
    { day: 6, closed: false, open: '09:00', close: '18:00' },
  ],
};

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

/**
 * Conteúdo de EXEMPLO. Aparece só no modo demonstração (sem Supabase
 * configurado). Com o banco ligado, o site nunca mostra estes preços.
 */
export const demoContent: SiteContent = {
  settings: storeSettings,
  promotions: [
    { id: 'seed-promo-1', title: 'Lambrusco tinto italiano', description: 'Frisante e levemente adocicado, 750 ml.', price_from_cents: 3490, price_cents: 2950, unit: 'garrafa', starts_at: null, ends_at: inDays(6), image_path: null, image_alt: '', sort_order: 1, published: true },
    { id: 'seed-promo-2', title: 'Vinho chileno reserva', description: 'Carménère do Vale Central. Leve 3 e ganhe 10% no caixa.', price_from_cents: 7490, price_cents: 5990, unit: 'garrafa', starts_at: null, ends_at: inDays(9), image_path: null, image_alt: '', sort_order: 2, published: true },
    { id: 'seed-promo-3', title: 'Espumante brut nacional', description: 'Serra Gaúcha, método tradicional.', price_from_cents: 8990, price_cents: 6990, unit: 'garrafa', starts_at: null, ends_at: inDays(4), image_path: null, image_alt: '', sort_order: 3, published: true },
    { id: 'seed-promo-4', title: 'Cerveja IPA importada', description: 'Lata de 473 ml, bem lupulada.', price_from_cents: 2290, price_cents: 1790, unit: 'lata', starts_at: null, ends_at: inDays(5), image_path: null, image_alt: '', sort_order: 4, published: true },
    { id: 'seed-promo-5', title: 'Gin London Dry', description: 'Garrafa de 750 ml, ótimo para tônica.', price_from_cents: 11990, price_cents: 9490, unit: 'garrafa', starts_at: null, ends_at: inDays(3), image_path: null, image_alt: '', sort_order: 5, published: true },
  ],
  highlights: [
    { id: 'seed-hl-1', name: 'Rosé chileno', description: 'Seco e fresco, para dias quentes.', category: 'Vinhos', price_cents: 6490, unit: 'garrafa', image_path: null, image_alt: '', sort_order: 1, published: true },
    { id: 'seed-hl-2', name: 'Tinto português do Douro', description: 'Encorpado, vai bem com carnes.', category: 'Vinhos', price_cents: 8900, unit: 'garrafa', image_path: null, image_alt: '', sort_order: 2, published: true },
    { id: 'seed-hl-3', name: 'Prosecco italiano', description: 'Extra dry, 750 ml.', category: 'Espumantes', price_cents: 7990, unit: 'garrafa', image_path: null, image_alt: '', sort_order: 3, published: true },
    { id: 'seed-hl-4', name: 'Cerveja belga de trigo', description: 'Garrafa de 330 ml.', category: 'Cervejas', price_cents: 1990, unit: 'un', image_path: null, image_alt: '', sort_order: 4, published: true },
    { id: 'seed-hl-5', name: 'Uísque escocês 12 anos', description: 'Blended, garrafa de 1 litro.', category: 'Destilados', price_cents: 18900, unit: 'garrafa', image_path: null, image_alt: '', sort_order: 5, published: true },
    { id: 'seed-hl-6', name: 'Taça de cristal para tinto', description: 'Vendida avulsa ou em caixa com seis.', category: 'Acessórios', price_cents: 3900, unit: 'un', image_path: null, image_alt: '', sort_order: 6, published: true },
  ],
  news: [
    { id: 'seed-news-1', title: 'Chegou nova leva de vinhos chilenos', body: 'Tintos, brancos e rosés que ainda não tínhamos na loja. Passe para conhecer.', published_at: inDays(-2), image_path: null, image_alt: '', published: true },
    { id: 'seed-news-2', title: 'Kits de presente sob encomenda', body: 'Monte o seu com vinho, espumante, taças e caixa de madeira. Ligue para encomendar.', published_at: inDays(-9), image_path: null, image_alt: '', published: true },
  ],
};

/** Com o banco configurado, as listas começam vazias (nada de preço fictício). */
export const emptyLists = { promotions: [], highlights: [], news: [] } as const;
