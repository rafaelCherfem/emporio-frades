import { describe, expect, it } from 'vitest';
import { demoContent as seed, storeSettings } from '../../src/data/seed';
import { centsToInput, formatBRL, isPromotionActive, parseBRLToCents, splitPrice } from '../../src/lib/format';
import { activeNotices, describeSpecial, groupHours, openStatus, storeDate } from '../../src/lib/hours';
import { highlightSchema, parseList, promotionSchema, specialDaySchema, storeSettingsSchema, type SpecialDay } from '../../src/lib/schemas';
import { illustrationFor, promotionList, specialList, specialNotice } from '../../src/lib/views';
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

describe('horário de funcionamento (horário real da loja)', () => {
  const hours = storeSettings.hours;

  it('aberto no meio da tarde de quarta', () => {
    expect(openStatus(hours, brt('2026-10-21T15:00:00'))).toEqual({ open: true, label: 'Aberto agora, fecha às 19h' });
  });

  it('fechado antes de abrir', () => {
    expect(openStatus(hours, brt('2026-10-21T08:30:00')).label).toBe('Fechado, abre hoje às 9h');
  });

  it('fechado à noite aponta para amanhã', () => {
    expect(openStatus(hours, brt('2026-10-21T19:00:00')).label).toBe('Fechado, abre amanhã às 9h');
  });

  it('sábado fecha mais cedo', () => {
    expect(openStatus(hours, brt('2026-10-24T17:30:00')).label).toBe('Aberto agora, fecha às 18h');
  });

  it('sábado à noite pula o domingo fechado', () => {
    expect(openStatus(hours, brt('2026-10-24T18:30:00')).label).toBe('Fechado, abre segunda às 9h');
  });

  it('domingo: fechado, abre amanhã', () => {
    expect(openStatus(hours, brt('2026-10-25T11:00:00')).label).toBe('Fechado, abre amanhã às 9h');
  });

  it('usa o fuso da loja, não o do visitante', () => {
    // 22h30 UTC = 19h30 em Brasília (fechado na quarta)
    expect(openStatus(hours, new Date('2026-10-21T22:30:00Z')).open).toBe(false);
  });

  it('expediente que passa da meia-noite', () => {
    const late = hours.map((h) => ({ ...h, closed: false, open: '18:00', close: '02:00' }));
    expect(openStatus(late, brt('2026-10-22T01:00:00')).label).toBe('Aberto agora, fecha às 2h');
    expect(openStatus(late, brt('2026-10-22T03:00:00')).label).toBe('Fechado, abre hoje às 18h');
  });

  it('agrupa dias iguais', () => {
    expect(groupHours(hours).map((g) => `${g.days}: ${g.time}`)).toEqual([
      'Segunda a sexta: 9h às 19h',
      'Sábado: 9h às 18h',
      'Domingo: Fechado',
    ]);
  });
});

describe('dados reais da loja', () => {
  it('são válidos e geram os links certos', async () => {
    const { contactLinks } = await import('../../src/lib/views');
    expect(storeSettingsSchema.safeParse(storeSettings).success).toBe(true);
    const l = contactLinks(storeSettings);
    expect(l.phone).toBe('tel:+551135429564');
    expect(l.phoneLabel).toBe('(11) 3542-9564');
    expect(l.whatsapp).toBeNull();
    expect(l.instagram).toBe('https://www.instagram.com/emporiofrades_/');
    expect(l.maps).toContain(encodeURIComponent('-23.6037774,-46.6153218'));
    expect(l.waze).toBe('https://waze.com/ul?ll=-23.6037774,-46.6153218&navigate=yes');
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

  it('limita a quantidade de itens validados', async () => {
    const { MAX_ROWS } = await import('../../src/lib/schemas');
    const many = Array.from({ length: 5000 }, (_, i) => ({ ...seed.promotions[0], id: `seed-x-${i}` }));
    expect(parseList(promotionSchema, many)).toHaveLength(MAX_ROWS);
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

describe('imagem reserva das garrafas', () => {
  const pick = (...t: (string | null)[]) => illustrationFor(...t).replace(/^.*\/|\.webp$/g, '');

  it('escolhe pela bebida do nome', () => {
    expect(pick('Prosecco italiano')).toBe('espumante');
    expect(pick('Rosé chileno')).toBe('rose');
    expect(pick('Uísque escocês 12 anos')).toBe('whisky');
    expect(pick('Cerveja belga de trigo')).toBe('cerveja');
    expect(pick('Gin London Dry')).toBe('gin');
    expect(pick('Taça de cristal para tinto')).toBe('taca');
    expect(pick('Tinto português do Douro')).toBe('tinto');
  });

  it('o título manda; o texto só desempata', () => {
    expect(pick('Kits de presente sob encomenda', 'Monte o seu com vinho, espumante, taças')).toBe('presente');
    expect(pick('Chegou nova leva de vinhos chilenos', 'Tintos, brancos e rosés')).toBe('tinto');
    expect(pick('Novidade da semana', 'Chegaram cervejas artesanais')).toBe('cerveja');
    expect(pick('Promoção', null)).toBe('tinto');
  });
});

describe('feriados e datas especiais', () => {
  const hours = storeSettings.hours; // seg–sex 9h–19h, sáb 9h–18h, dom fechado
  const sp = (over: Partial<SpecialDay>): SpecialDay => ({
    id: 'seed-x', date: '2026-12-25', title: 'Natal', closed: true, open: '09:00', close: '13:00', note: '', notice_days: 7, ...over,
  });
  const natal = sp({});
  const vespera = sp({ id: 'seed-v', date: '2026-12-24', title: 'Véspera de Natal', closed: false, open: '09:00', close: '14:00' });

  it('no feriado fechado, avisa o motivo e quando reabre', () => {
    // 25/12/2026 é sexta; sábado abre normalmente
    expect(openStatus(hours, brt('2026-12-25T10:00:00'), [natal]).label).toBe('Fechado hoje (Natal), abre amanhã às 9h');
  });

  it('na véspera à noite, pula o feriado', () => {
    expect(openStatus(hours, brt('2026-12-24T19:30:00'), [natal]).label).toBe('Fechado, abre sábado às 9h');
  });

  it('horário reduzido: fecha mais cedo e diz por quê', () => {
    expect(openStatus(hours, brt('2026-12-24T13:00:00'), [vespera, natal])).toEqual({
      open: true,
      label: 'Aberto agora, fecha às 14h (Véspera de Natal)',
    });
    expect(openStatus(hours, brt('2026-12-24T15:00:00'), [vespera, natal]).label).toBe('Fechado, abre sábado às 9h');
  });

  it('sem data especial, nada muda', () => {
    expect(openStatus(hours, brt('2026-12-25T10:00:00'), []).label).toBe('Aberto agora, fecha às 19h');
  });

  it('fechado por vários dias aponta a data da volta', () => {
    const ferias = Array.from({ length: 10 }, (_, i) => sp({ id: `seed-f${i}`, date: storeDate(brt('2027-01-02T12:00:00'), i), title: 'Férias' }));
    expect(openStatus(hours, brt('2027-01-02T10:00:00'), ferias).label).toBe('Fechado hoje (Férias), abre dia 12/01 às 9h');
  });

  it('o aviso aparece só dentro da antecedência escolhida', () => {
    expect(activeNotices([natal], brt('2026-12-17T10:00:00'))).toHaveLength(0); // faltam 8 dias
    expect(activeNotices([natal], brt('2026-12-18T10:00:00'))).toHaveLength(1); // faltam 7
    expect(activeNotices([sp({ notice_days: 0 })], brt('2026-12-24T23:00:00'))).toHaveLength(0);
    expect(activeNotices([sp({ notice_days: 0 })], brt('2026-12-25T08:00:00'))).toHaveLength(1);
    expect(activeNotices([natal], brt('2026-12-26T10:00:00'))).toHaveLength(0); // já passou
  });

  it('descreve quando e o que muda', () => {
    expect(describeSpecial(natal, brt('2026-12-20T10:00:00'))).toEqual({ when: 'Sexta, 25 de dezembro', what: 'Loja fechada' });
    expect(describeSpecial(natal, brt('2026-12-24T10:00:00')).when).toBe('Amanhã');
    expect(describeSpecial(vespera, brt('2026-12-24T10:00:00'))).toEqual({ when: 'Hoje', what: 'Aberto das 9h às 14h' });
  });

  it('texto do dono aparece como texto, nunca como HTML', () => {
    const evil = sp({ title: '<img src=x onerror=alert(1)>', note: '<script>x</script>' });
    const html = toHTML(specialNotice([evil], brt('2026-12-24T10:00:00')));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
  });

  it('lista em "Onde estamos" mostra as próximas, em ordem', () => {
    const html = toHTML(specialList([natal, vespera], brt('2026-12-01T10:00:00')));
    expect(html.indexOf('Véspera de Natal')).toBeLessThan(html.indexOf('>Natal<'));
    expect(html).toContain('9h às 14h');
  });

  it('schema recusa horário igual e antecedência fora do limite', () => {
    expect(specialDaySchema.safeParse(sp({ closed: false, open: '10:00', close: '10:00' })).success).toBe(false);
    expect(specialDaySchema.safeParse(sp({ notice_days: 90 })).success).toBe(false);
    expect(specialDaySchema.safeParse(sp({ date: '25/12/2026' })).success).toBe(false);
    expect(specialDaySchema.safeParse(natal).success).toBe(true);
  });
});
