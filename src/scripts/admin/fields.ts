import { centsToInput, parseBRLToCents } from '../../lib/format';

/**
 * Especificação dos formulários do painel. Cada campo sabe se mostrar,
 * ler o valor digitado e devolvê-lo no formato do banco.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'money'
  | 'date-start'
  | 'date-end'
  | 'date-publish'
  | 'day'
  | 'time'
  | 'number'
  | 'checkbox'
  | 'image';

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  max?: number;
  required?: boolean;
  help?: string;
  placeholder?: string;
  list?: string[];
  /** Imagem: maior lado após otimizar (px) */
  maxSide?: number;
  /** Número: limites */
  min?: number;
  /** Valor inicial ao criar */
  initial?: unknown;
}

export type Entity = 'banners' | 'promotions' | 'highlights' | 'news' | 'special_days';

export type ImageFolder = 'banners' | 'promocoes' | 'destaques' | 'novidades';

export interface EntityConfig {
  table: Entity;
  title: string;
  singular: string;
  newLabel: string;
  folder?: ImageFolder;
  labelField: string;
  order: { column: string; ascending: boolean };
  sortable: boolean;
  fields: Field[];
}

export const ENTITIES: Record<Entity, EntityConfig> = {
  banners: {
    table: 'banners',
    title: 'Banners',
    singular: 'banner',
    newLabel: 'Novo banner',
    folder: 'banners',
    labelField: 'title',
    order: { column: 'sort_order', ascending: true },
    sortable: true,
    fields: [
      { name: 'title', label: 'Nome do banner', type: 'text', max: 90, required: true, placeholder: 'Espumantes de fim de ano', help: 'Só para você se organizar no painel. Não aparece no site.' },
      { name: 'image_path', label: 'Imagem (computador)', type: 'image', required: true, maxSide: 2200, help: 'Formato deitado: 1920 × 720 px. Deixe textos importantes longe das bordas.' },
      { name: 'image_mobile_path', label: 'Imagem (celular)', type: 'image', maxSide: 1400, help: 'Opcional, formato em pé: 1080 × 1350 px. Sem ela, o celular usa a imagem do computador.' },
      { name: 'image_alt', label: 'O que o banner diz', type: 'text', max: 200, required: true, help: 'Escreva o texto da arte. Ex.: "Espumantes com 15% de desconto até domingo". Leitores de tela e o Google leem isso.' },
      { name: 'link_url', label: 'Ao tocar no banner, abrir', type: 'text', max: 500, placeholder: '#promocoes', help: 'Opcional. Uma seção do site (#promocoes, #em-alta, #novidades, #onde-estamos), um link https:// ou tel:+551133334444.', list: ['#promocoes', '#em-alta', '#novidades', '#onde-estamos'] },
      { name: 'starts_at', label: 'Começa em', type: 'date-start', help: 'Em branco: já aparece.' },
      { name: 'ends_at', label: 'Termina em', type: 'date-end', help: 'Some do site sozinho depois desse dia.' },
      { name: 'published', label: 'Publicado no site', type: 'checkbox' },
    ],
  },
  promotions: {
    table: 'promotions',
    title: 'Promoções',
    singular: 'promoção',
    newLabel: 'Nova promoção',
    folder: 'promocoes',
    labelField: 'title',
    order: { column: 'sort_order', ascending: true },
    sortable: true,
    fields: [
      { name: 'title', label: 'Produto', type: 'text', max: 90, required: true, placeholder: 'Prosecco italiano extra dry' },
      { name: 'description', label: 'Detalhe', type: 'textarea', max: 280, help: 'Origem, tamanho, condição ("leve 3, pague 2").' },
      { name: 'price_from_cents', label: 'Preço normal (De)', type: 'money', help: 'Opcional. Aparece riscado.' },
      { name: 'price_cents', label: 'Preço da promoção (Por)', type: 'money' },
      { name: 'unit', label: 'Unidade', type: 'text', max: 30, placeholder: 'kg, un, 100 g, garrafa', list: ['garrafa', 'un', 'lata', 'caixa', 'kit', 'kg'] },
      { name: 'starts_at', label: 'Começa em', type: 'date-start', help: 'Em branco: já vale.' },
      { name: 'ends_at', label: 'Termina em', type: 'date-end', help: 'Some do site sozinha depois desse dia.' },
      { name: 'image_path', label: 'Foto', type: 'image' },
      { name: 'image_alt', label: 'Descrição da foto', type: 'text', max: 160, help: 'Para quem usa leitor de tela. Ex.: "Garrafa de prosecco com rótulo dourado".' },
      { name: 'published', label: 'Publicada no site', type: 'checkbox' },
    ],
  },
  highlights: {
    table: 'highlights',
    title: 'Em alta',
    singular: 'produto',
    newLabel: 'Novo produto',
    folder: 'destaques',
    labelField: 'name',
    order: { column: 'sort_order', ascending: true },
    sortable: true,
    fields: [
      { name: 'name', label: 'Produto', type: 'text', max: 90, required: true },
      { name: 'category', label: 'Categoria', type: 'text', max: 40, help: 'Produtos da mesma categoria aparecem juntos.', list: ['Vinhos', 'Espumantes', 'Cervejas', 'Destilados', 'Acessórios', 'Presentes'] },
      { name: 'description', label: 'Detalhe', type: 'textarea', max: 200 },
      { name: 'price_cents', label: 'Preço', type: 'money', help: 'Opcional.' },
      { name: 'unit', label: 'Unidade', type: 'text', max: 30, list: ['garrafa', 'un', 'lata', 'caixa', 'kit', 'kg'] },
      { name: 'image_path', label: 'Foto', type: 'image', help: 'Dica: foto da garrafa com fundo branco ou PNG sem fundo fica com cara de vitrine. Sem foto, o site usa um desenho da bebida.' },
      { name: 'image_alt', label: 'Descrição da foto', type: 'text', max: 160 },
      { name: 'published', label: 'Publicado no site', type: 'checkbox' },
    ],
  },
  special_days: {
    table: 'special_days',
    title: 'Feriados e datas especiais',
    singular: 'data especial',
    newLabel: 'Nova data especial',
    labelField: 'title',
    order: { column: 'date', ascending: true },
    sortable: false,
    fields: [
      { name: 'date', label: 'Data', type: 'day', required: true, help: 'Pode programar com meses de antecedência.' },
      { name: 'title', label: 'Motivo', type: 'text', max: 60, required: true, placeholder: 'Natal', list: ['Feriado', 'Natal', 'Véspera de Natal', 'Ano Novo', 'Véspera de Ano Novo', 'Carnaval', 'Sexta-feira Santa', 'Corpus Christi', 'Balanço', 'Inventário'] },
      { name: 'closed', label: 'Loja fechada o dia todo', type: 'checkbox', initial: true },
      { name: 'open', label: 'Abre às', type: 'time', initial: '09:00', help: 'Só vale se a loja abrir nesse dia (desmarque "fechada" acima).' },
      { name: 'close', label: 'Fecha às', type: 'time', initial: '13:00' },
      { name: 'note', label: 'Recado para os clientes', type: 'text', max: 160, placeholder: 'Voltamos dia 26 no horário normal.', help: 'Opcional. Aparece no aviso do site.' },
      { name: 'notice_days', label: 'Avisar no site quantos dias antes', type: 'number', min: 0, max: 60, initial: 7, help: 'Ex.: 7 = o aviso aparece no topo do site uma semana antes. 0 = só no próprio dia.' },
    ],
  },
  news: {
    table: 'news',
    title: 'Novidades',
    singular: 'novidade',
    newLabel: 'Nova novidade',
    folder: 'novidades',
    labelField: 'title',
    order: { column: 'published_at', ascending: false },
    sortable: false,
    fields: [
      { name: 'title', label: 'Título', type: 'text', max: 120, required: true },
      { name: 'body', label: 'Texto', type: 'textarea', max: 1500 },
      { name: 'published_at', label: 'Data', type: 'date-publish', help: 'Uma data futura agenda a publicação.' },
      { name: 'image_path', label: 'Foto', type: 'image' },
      { name: 'image_alt', label: 'Descrição da foto', type: 'text', max: 160 },
      { name: 'published', label: 'Publicada no site', type: 'checkbox' },
    ],
  },
};

/* ---------- Datas no fuso da loja (Brasília, UTC-3, sem horário de verão) ---------- */

const OFFSET = '-03:00';

export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 10);
}

export function dateInputToIso(value: string, kind: 'start' | 'end' | 'publish'): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (kind === 'start') return new Date(`${value}T00:00:00${OFFSET}`).toISOString();
  if (kind === 'end') return new Date(`${value}T23:59:59${OFFSET}`).toISOString();
  const today = isoToDateInput(new Date().toISOString());
  return value === today ? new Date().toISOString() : new Date(`${value}T08:00:00${OFFSET}`).toISOString();
}

/** Valor do banco → texto do input. */
export function toInput(field: Field, value: unknown): string {
  switch (field.type) {
    case 'money':
      return centsToInput(typeof value === 'number' ? value : null);
    case 'date-start':
    case 'date-end':
    case 'date-publish':
      return isoToDateInput(typeof value === 'string' ? value : null);
    case 'number':
      return typeof value === 'number' ? String(value) : '';
    default:
      return typeof value === 'string' ? value : '';
  }
}

/** Texto do input → valor do banco. `error` quando o formato está errado. */
export function fromInput(field: Field, raw: string): { value: unknown; error?: string } {
  const v = raw.trim();
  switch (field.type) {
    case 'money': {
      if (!v) return { value: null };
      const cents = parseBRLToCents(v);
      return cents == null ? { value: null, error: 'Use o formato 24,90' } : { value: cents };
    }
    case 'date-start':
      return { value: v ? dateInputToIso(v, 'start') : null };
    case 'date-end':
      return { value: v ? dateInputToIso(v, 'end') : null };
    case 'date-publish':
      return { value: dateInputToIso(v || isoToDateInput(new Date().toISOString()), 'publish') };
    case 'day':
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { value: v } : { value: null, error: 'Escolha a data' };
    case 'time':
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? { value: v } : { value: null, error: 'Use o formato 09:00' };
    case 'number': {
      const n = Number(v);
      if (!v || !Number.isInteger(n)) return { value: null, error: 'Use um número inteiro' };
      if ((field.min != null && n < field.min) || (field.max != null && n > field.max)) {
        return { value: n, error: `Entre ${field.min ?? 0} e ${field.max}` };
      }
      return { value: n };
    }
    default:
      return { value: v };
  }
}
