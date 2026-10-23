import { z } from 'zod';

// Sem geração de código em tempo de execução (new Function): a CSP com Trusted Types
// proíbe isso, e o modo "jitless" do Zod 4 valida do mesmo jeito sem precisar.
z.config({ jitless: true });

/**
 * Contratos do conteúdo. Os mesmos limites existem como CHECK no banco
 * (supabase/migrations). Linhas que não batem com o schema são descartadas
 * na leitura, nunca exibidas pela metade.
 */

const text = (max: number) => z.string().trim().max(max);
const requiredText = (max: number) => text(max).min(1, 'Campo obrigatório');
const cents = z.number().int().min(0).max(100_000_00);
const isoDate = z.iso.datetime({ offset: true }).nullable();
const imagePath = z.string().max(200).nullable();

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato 08:30');

export const dayHoursSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    closed: z.boolean(),
    open: time,
    close: time,
  })
  .refine((h) => h.closed || h.open !== h.close, { message: 'Abertura e fechamento iguais' });

export const hoursSchema = z
  .array(dayHoursSchema)
  .length(7)
  .refine((arr) => new Set(arr.map((d) => d.day)).size === 7, { message: 'Um registro por dia' });

export const storeSettingsSchema = z.object({
  name: requiredText(80),
  tagline: text(160),
  about: text(1200),
  street: text(120),
  number: text(20),
  district: text(80),
  city: text(80),
  state: z.string().trim().regex(/^[A-Z]{2}$|^$/, 'UF com 2 letras'),
  zip: z.string().trim().regex(/^\d{5}-?\d{3}$|^$/, 'CEP inválido'),
  reference: text(160),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  phone: z.string().trim().regex(/^\d{10,13}$|^$/, 'Só números, com DDD'),
  whatsapp: z.string().trim().regex(/^\d{10,13}$|^$/, 'Só números, com DDD'),
  whatsapp_message: text(300),
  email: z.email('E-mail inválido').max(254).or(z.literal('')),
  instagram: text(120),
  facebook: text(120),
  tiktok: text(120),
  hours: hoursSchema,
  updated_at: z.string().optional(),
});

export const promotionSchema = z
  .object({
    id: z.uuid().or(z.string().regex(/^seed-[a-z0-9-]+$/)),
    title: requiredText(90),
    description: text(280),
    price_from_cents: cents.nullable(),
    price_cents: cents.nullable(),
    unit: text(30),
    starts_at: isoDate,
    ends_at: isoDate,
    image_path: imagePath,
    image_alt: text(160),
    sort_order: z.number().int().min(0).max(9999),
    published: z.boolean(),
  })
  .refine(
    (p) => p.price_from_cents == null || p.price_cents == null || p.price_cents < p.price_from_cents,
    { message: 'O preço promocional precisa ser menor que o preço normal', path: ['price_cents'] },
  )
  .refine((p) => !p.starts_at || !p.ends_at || p.starts_at <= p.ends_at, {
    message: 'A data final precisa ser depois da inicial',
    path: ['ends_at'],
  });

export const highlightSchema = z.object({
  id: z.uuid().or(z.string().regex(/^seed-[a-z0-9-]+$/)),
  name: requiredText(90),
  description: text(200),
  category: text(40),
  price_cents: cents.nullable(),
  unit: text(30),
  image_path: imagePath,
  image_alt: text(160),
  sort_order: z.number().int().min(0).max(9999),
  published: z.boolean(),
});

export const newsSchema = z.object({
  id: z.uuid().or(z.string().regex(/^seed-[a-z0-9-]+$/)),
  title: requiredText(120),
  body: text(1500),
  published_at: z.iso.datetime({ offset: true }),
  image_path: imagePath,
  image_alt: text(160),
  published: z.boolean(),
});

export type DayHours = z.infer<typeof dayHoursSchema>;
export type StoreSettings = z.infer<typeof storeSettingsSchema>;
export type Promotion = z.infer<typeof promotionSchema>;
export type Highlight = z.infer<typeof highlightSchema>;
/** Link de banner: vazio, âncora interna, telefone ou https (espelha valid_banner_link no banco). */
export const bannerLink = z
  .string()
  .trim()
  .max(500)
  .regex(/^$|^#[a-z0-9-]{1,40}$|^tel:\+\d{8,15}$|^https:\/\/[^\s<>"']+$/, 'Use um endereço https://, uma seção do site ou um telefone');

export const bannerSchema = z
  .object({
    id: z.uuid().or(z.string().regex(/^seed-[a-z0-9-]+$/)),
    title: requiredText(90),
    image_path: z.string().min(1, 'Escolha a imagem do banner').max(200),
    image_mobile_path: imagePath,
    image_alt: requiredText(200),
    link_url: bannerLink,
    starts_at: isoDate,
    ends_at: isoDate,
    sort_order: z.number().int().min(0).max(9999),
    published: z.boolean(),
  })
  .refine((b) => !b.starts_at || !b.ends_at || b.starts_at <= b.ends_at, {
    message: 'A data final precisa ser depois da inicial',
    path: ['ends_at'],
  });

export type News = z.infer<typeof newsSchema>;
export type Banner = z.infer<typeof bannerSchema>;

export interface SiteContent {
  settings: StoreSettings;
  promotions: Promotion[];
  highlights: Highlight[];
  news: News[];
  banners: Banner[];
}

/** Teto de itens por lista: nunca validar volumes absurdos vindos da rede. */
export const MAX_ROWS = 200;

/** Valida uma lista e descarta itens inválidos sem derrubar o resto. */
export function parseList<T>(schema: z.ZodType<T>, rows: unknown): T[] {
  if (!Array.isArray(rows)) return [];
  const out: T[] = [];
  for (const row of rows.slice(0, MAX_ROWS)) {
    const r = schema.safeParse(row);
    if (r.success) out.push(r.data);
  }
  return out;
}
