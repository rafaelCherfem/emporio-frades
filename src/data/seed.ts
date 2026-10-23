import type { SiteContent } from '../lib/schemas';

/**
 * Conteúdo de reserva. Usado:
 *  - no HTML gerado no build (SEO e quem navega sem JavaScript);
 *  - quando o banco não responde.
 *
 * Depois que o Supabase estiver configurado, o dono edita tudo pelo painel
 * e este arquivo vira só uma rede de segurança. Troque os dados de contato
 * abaixo pelos reais antes de publicar.
 */

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

export const seed: SiteContent = {
  settings: {
    name: 'Empório Frades',
    tagline: 'Comidas e bebidas escolhidas a dedo, do jeito que a gente gosta de servir em casa.',
    about:
      'Queijos curados, frios fatiados na hora, vinhos, cervejas especiais, azeites e aquele pão que acaba antes do almoço. Um empório de bairro, com atendimento de quem conhece cada prateleira.',
    street: 'Rua Exemplo',
    number: '123',
    district: 'Centro',
    city: 'Sua cidade',
    state: 'SP',
    zip: '',
    reference: 'Ao lado da praça, em frente à padaria',
    latitude: null,
    longitude: null,
    phone: '11900000000',
    whatsapp: '11900000000',
    whatsapp_message: 'Olá! Vi o site do Empório Frades e queria fazer uma pergunta.',
    email: '',
    instagram: 'emporiofrades',
    facebook: '',
    tiktok: '',
    hours: [
      { day: 0, closed: false, open: '09:00', close: '13:00' },
      { day: 1, closed: false, open: '08:00', close: '20:00' },
      { day: 2, closed: false, open: '08:00', close: '20:00' },
      { day: 3, closed: false, open: '08:00', close: '20:00' },
      { day: 4, closed: false, open: '08:00', close: '20:00' },
      { day: 5, closed: false, open: '08:00', close: '21:00' },
      { day: 6, closed: false, open: '08:00', close: '21:00' },
    ],
  },
  promotions: [
    {
      id: 'seed-promo-1',
      title: 'Queijo meia cura artesanal',
      description: 'Da Serra da Canastra, cortado na hora.',
      price_from_cents: 8990,
      price_cents: 6990,
      unit: 'kg',
      starts_at: null,
      ends_at: inDays(6),
      image_path: null,
      image_alt: '',
      sort_order: 1,
      published: true,
    },
    {
      id: 'seed-promo-2',
      title: 'Vinho tinto Malbec',
      description: 'Mendoza, 750 ml. Leve 3 e ganhe 10% no caixa.',
      price_from_cents: 7490,
      price_cents: 5990,
      unit: 'garrafa',
      starts_at: null,
      ends_at: inDays(9),
      image_path: null,
      image_alt: '',
      sort_order: 2,
      published: true,
    },
    {
      id: 'seed-promo-3',
      title: 'Azeite extravirgem português',
      description: 'Garrafa de 500 ml, acidez máxima 0,3%.',
      price_from_cents: 5490,
      price_cents: 4290,
      unit: 'un',
      starts_at: null,
      ends_at: inDays(4),
      image_path: null,
      image_alt: '',
      sort_order: 3,
      published: true,
    },
    {
      id: 'seed-promo-4',
      title: 'Presunto parma fatiado',
      description: 'Bandeja montada no balcão.',
      price_from_cents: 3290,
      price_cents: 2690,
      unit: '100 g',
      starts_at: null,
      ends_at: inDays(5),
      image_path: null,
      image_alt: '',
      sort_order: 4,
      published: true,
    },
    {
      id: 'seed-promo-5',
      title: 'Cerveja IPA artesanal',
      description: 'Lata de 473 ml, de cervejaria local.',
      price_from_cents: 2290,
      price_cents: 1790,
      unit: 'lata',
      starts_at: null,
      ends_at: inDays(3),
      image_path: null,
      image_alt: '',
      sort_order: 5,
      published: true,
    },
  ],
  highlights: [
    { id: 'seed-hl-1', name: 'Pão de fermentação natural', description: 'Sai do forno às 7h e às 16h.', category: 'Padaria', price_cents: 2400, unit: 'un', image_path: null, image_alt: '', sort_order: 1, published: true },
    { id: 'seed-hl-2', name: 'Mortadela trufada', description: 'Fatiada fininha, do jeito que pede o sanduíche.', category: 'Frios', price_cents: 1190, unit: '100 g', image_path: null, image_alt: '', sort_order: 2, published: true },
    { id: 'seed-hl-3', name: 'Burrata fresca', description: 'Chega às quintas. Costuma acabar no sábado.', category: 'Queijos', price_cents: 3290, unit: 'un', image_path: null, image_alt: '', sort_order: 3, published: true },
    { id: 'seed-hl-4', name: 'Espumante brut nacional', description: 'Serra Gaúcha, ótimo custo para brindar.', category: 'Vinhos', price_cents: 6900, unit: 'garrafa', image_path: null, image_alt: '', sort_order: 4, published: true },
    { id: 'seed-hl-5', name: 'Geleia de pimenta da casa', description: 'Feita aqui, pote de 250 g.', category: 'Mercearia', price_cents: 2800, unit: 'pote', image_path: null, image_alt: '', sort_order: 5, published: true },
    { id: 'seed-hl-6', name: 'Tábua de frios para dois', description: 'Montada na hora. Encomende pelo WhatsApp.', category: 'Encomendas', price_cents: 8900, unit: '', image_path: null, image_alt: '', sort_order: 6, published: true },
  ],
  news: [
    {
      id: 'seed-news-1',
      title: 'Chegaram os vinhos da nova importação',
      body: 'Rótulos do Douro e do Alentejo que ainda não tínhamos na loja. Passe para provar na degustação de sábado, a partir das 11h.',
      published_at: inDays(-2),
      image_path: null,
      image_alt: '',
      published: true,
    },
    {
      id: 'seed-news-2',
      title: 'Cestas de presente sob encomenda',
      body: 'Monte a sua com queijos, vinhos, geleias e o que mais quiser. Peça pelo WhatsApp com dois dias de antecedência.',
      published_at: inDays(-9),
      image_path: null,
      image_alt: '',
      published: true,
    },
    {
      id: 'seed-news-3',
      title: 'Novo horário aos domingos',
      body: 'Agora abrimos das 9h às 13h. Pão quentinho garantido para o café da manhã.',
      published_at: inDays(-20),
      image_path: null,
      image_alt: '',
      published: true,
    },
  ],
};
