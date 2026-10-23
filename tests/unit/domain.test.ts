import { describe, expect, it } from 'vitest';
import { seed } from '../../src/data/seed';
import { centsToInput, formatBRL, isPromotionActive, parseBRLToCents, splitPrice } from '../../src/lib/format';
import { groupHours, openStatus } from '../../src/lib/hours';
import { highlightSchema, parseList, promotionSchema, storeSettingsSchema } from '../../src/lib/schemas';
import { promotionList } from '../../src/lib/views';
import { toHTML } from '../../src/lib/vnode';

/** Cria uma data a partir do horário de Brasília (UTC-3, sem horário de verão). */
const brt = (iso: string) => new Date(`${iso}-03:00`);

describe('preços', () => {
  it('formata em reais', () => {
    expect(formatBRL(6990)).toBe('R$ 69,90');
    expect(formatBRL(null)).toBeNull();
  });

  it('separa reais e centavos', () => {
    expect(splitPrice(123405)).toEqual({ whole: '1.234', fraction: '05' });
  });

  it.each([
    ['24,90', 2490],
    ['24', 2400],
    ['R$ 1.024,90', 102490],
    ['0,5', 50],
  ])('converte %s', (input, cents) => {
    expect(parseBRLToCents(input)).toBe(cents);
  });

  it.each(['abc', '24,999', '-5', '1e5', '24.90.1'])('recusa %s', (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });

  it('ida e volta sem perder centavos', () => {
    for (const c of [0, 1, 99, 100, 2490, 999999]) expect(parseBRLToCents(centsToInput(c))).toBe(c);
  });
});

describe('horário de funcionamento', () => {
  const hours = seed.settings.hours;

  it('aberto no meio da tarde de quarta', () => {
    expect(openStatus(hours, brt('2026-10-21T15:00:00'))).toEqual({ open: true, label: 'Aberto agora, fecha às 20h' });
  });

  it('fechado antes de abrir', () => {
    expect(openStatus(hours, brt('2026-10-21T07:30:00')).label).toBe('Fechado, abre hoje às 8h');
  });

  it('fechado à noite aponta para amanhã', () => {
    expect(openStatus(hours, brt('2026-10-21T22:00:00')).label).toBe('Fechado, abre amanhã às 8h');
  });

  it('domingo à tarde fechado, abre segunda', () => {
    expect(openStatus(hours, brt('2026-10-25T14:00:00')).label).toBe('Fechado, abre amanhã às 8h');
  });

  it('usa o fuso da loja, não o do visitante', () => {
    // 23h UTC = 20h em Brasília (fechado na quarta)
    expect(openStatus(hours, new Date('2026-10-21T23:00:00Z')).open).toBe(false);
  });

  it('expediente que passa da meia-noite', () => {
    const late = hours.map((h) => ({ ...h, open: '18:00', close: '02:00' }));
    expect(openStatus(late, brt('2026-10-22T01:00:00')).label).toBe('Aberto agora, fecha às 2h');
    expect(openStatus(late, brt('2026-10-22T03:00:00')).label).toBe('Fechado, abre hoje às 18h');
  });

  it('agrupa dias iguais', () => {
    expect(groupHours(hours).map((g) => `${g.days}: ${g.time}`)).toEqual([
      'Segunda a quinta: 8h às 20h',
      'Sexta e sábado: 8h às 21h',
      'Domingo: 9h às 13h',
    ]);
  });
});

describe('schemas', () => {
  it('o conteúdo de reserva é válido', () => {
    expect(storeSettingsSchema.safeParse(seed.settings).success).toBe(true);
    expect(parseList(promotionSchema, seed.promotions)).toHaveLength(seed.promotions.length);
    expect(parseList(highlightSchema, seed.highlights)).toHaveLength(seed.highlights.length);
  });

  it('descarta só as linhas inválidas', () => {
    const rows = [seed.promotions[0], { ...seed.promotions[1], title: '' }, { lixo: true }, 'x'];
    expect(parseList(promotionSchema, rows)).toHaveLength(1);
    expect(parseList(promotionSchema, 'não é lista')).toEqual([]);
  });

  it('promoção com preço "por" maior que "de" é recusada', () => {
    const r = promotionSchema.safeParse({ ...seed.promotions[0], price_cents: 99999 });
    expect(r.success).toBe(false);
  });

  it('recusa texto acima do limite', () => {
    const r = promotionSchema.safeParse({ ...seed.promotions[0], title: 'x'.repeat(91) });
    expect(r.success).toBe(false);
  });

  it('recusa horário malformado', () => {
    const bad = { ...seed.settings, hours: seed.settings.hours.map((h) => ({ ...h, open: '25:00' })) };
    expect(storeSettingsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('promoções', () => {
  const p = seed.promotions[0]!;
  const now = new Date('2026-10-23T12:00:00Z');

  it('esconde rascunho, vencida e futura', () => {
    expect(isPromotionActive({ ...p, published: false }, now)).toBe(false);
    expect(isPromotionActive({ ...p, ends_at: '2026-10-22T00:00:00Z' }, now)).toBe(false);
    expect(isPromotionActive({ ...p, starts_at: '2026-10-24T00:00:00Z', ends_at: null }, now)).toBe(false);
    expect(isPromotionActive({ ...p, starts_at: null, ends_at: null }, now)).toBe(true);
  });

  it('título com HTML vira texto na etiqueta', () => {
    const html = toHTML(
      promotionList([{ ...p, ends_at: null, title: '<img src=x onerror=alert(1)>' }], { supabaseUrl: undefined, now }),
    );
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });
});
