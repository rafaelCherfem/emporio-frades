import type { DayHours, SpecialDay } from './schemas';

export const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

const TZ = 'America/Sao_Paulo';

/** Dia da semana (0 = domingo) e minutos desde meia-noite no fuso da loja. */
export function storeClock(now: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

function toMinutes(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export type OpenStatus =
  | { open: true; label: string }
  | { open: false; label: string };

/* ---------- Datas no fuso da loja ---------- */

const DAY_MS = 86_400_000;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Data da loja (AAAA-MM-DD), opcionalmente deslocada em dias. São Paulo não tem horário de verão. */
export function storeDate(now: Date, addDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(now.getTime() + addDays * DAY_MS),
  );
}

function utcOf(date: string): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Dia da semana (0 = domingo) de uma data AAAA-MM-DD. */
export function weekdayOf(date: string): number {
  return new Date(utcOf(date)).getUTCDay();
}

/** Diferença em dias entre duas datas AAAA-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / DAY_MS);
}

/** "25/12" */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** "Quinta, 25 de dezembro" */
export function longDate(date: string): string {
  const [, m = '1', d = '1'] = date.split('-');
  return `${DAY_NAMES[weekdayOf(date)]}, ${Number(d)} de ${MONTHS[Number(m) - 1]}`;
}

interface DayPlan {
  closed: boolean;
  open: string;
  close: string;
  special?: SpecialDay;
}

/** Horário que vale numa data: a data especial manda; senão, o horário da semana. */
export function planFor(date: string, hours: DayHours[], specials: SpecialDay[] = []): DayPlan {
  const special = specials.find((s) => s.date === date);
  if (special) return { closed: special.closed, open: special.open, close: special.close, special };
  const h = hours.find((x) => x.day === weekdayOf(date));
  return h ? { closed: h.closed, open: h.open, close: h.close } : { closed: true, open: '00:00', close: '00:00' };
}

/**
 * Status em linguagem natural: "Aberto agora, fecha às 21h" / "Fechado, abre amanhã às 8h".
 * Suporta horário que passa da meia-noite (ex.: 18:00–02:00) e respeita as datas especiais
 * (feriado fechado, horário reduzido).
 */
export function openStatus(hours: DayHours[], now = new Date(), specials: SpecialDay[] = []): OpenStatus {
  const { minutes } = storeClock(now);
  const today = planFor(storeDate(now), hours, specials);
  const yesterday = planFor(storeDate(now, -1), hours, specials);
  const tag = (p: DayPlan) => (p.special ? ` (${p.special.title})` : '');

  // Expediente de ontem que atravessou a meia-noite
  if (!yesterday.closed) {
    const o = toMinutes(yesterday.open);
    const c = toMinutes(yesterday.close);
    if (c < o && minutes < c) return { open: true, label: `Aberto agora, fecha às ${fmtHour(yesterday.close)}${tag(yesterday)}` };
  }

  if (!today.closed) {
    const o = toMinutes(today.open);
    const c = toMinutes(today.close);
    const overnight = c < o;
    if (minutes >= o && (overnight || minutes < c)) {
      return { open: true, label: `Aberto agora, fecha às ${fmtHour(today.close)}${tag(today)}` };
    }
    if (minutes < o) return { open: false, label: `Fechado, abre hoje às ${fmtHour(today.open)}${tag(today)}` };
  }

  const prefix = today.closed && today.special ? `Fechado hoje (${today.special.title})` : 'Fechado';
  for (let i = 1; i <= 21; i++) {
    const date = storeDate(now, i);
    const next = planFor(date, hours, specials);
    if (!next.closed) {
      const when = i === 1 ? 'amanhã' : i <= 6 ? DAY_NAMES[weekdayOf(date)]!.toLowerCase() : `dia ${shortDate(date)}`;
      return { open: false, label: `${prefix}, abre ${when} às ${fmtHour(next.open)}` };
    }
  }
  return { open: false, label: prefix };
}

/** Datas especiais de hoje em diante, em ordem. */
export function upcomingSpecials(specials: SpecialDay[], now = new Date()): SpecialDay[] {
  const today = storeDate(now);
  return specials.filter((s) => s.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** As que já devem aparecer no aviso (dentro da antecedência escolhida pelo dono). */
export function activeNotices(specials: SpecialDay[], now = new Date()): SpecialDay[] {
  const today = storeDate(now);
  return upcomingSpecials(specials, now).filter((s) => daysBetween(today, s.date) <= s.notice_days);
}

/** Textos prontos de uma data especial: quando e o que muda. */
export function describeSpecial(s: SpecialDay, now = new Date()): { when: string; what: string } {
  const diff = daysBetween(storeDate(now), s.date);
  const when = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : longDate(s.date);
  const what = s.closed ? 'Loja fechada' : `Aberto das ${fmtHour(s.open)} às ${fmtHour(s.close)}`;
  return { when, what };
}

/** "08:00" → "8h", "08:30" → "8h30". */
export function fmtHour(hhmm: string): string {
  const [h = '0', m = '00'] = hhmm.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
}

/** Agrupa dias consecutivos com o mesmo horário: "Segunda a sexta · 8h às 20h". */
export function groupHours(hours: DayHours[]): { days: string; time: string; includes: number[] }[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const byDay = new Map(hours.map((h) => [h.day, h]));
  const groups: { days: number[]; key: string; time: string }[] = [];
  for (const d of order) {
    const h = byDay.get(d);
    if (!h) continue;
    const time = h.closed ? 'Fechado' : `${fmtHour(h.open)} às ${fmtHour(h.close)}`;
    const last = groups.at(-1);
    if (last && last.key === time) last.days.push(d);
    else groups.push({ days: [d], key: time, time });
  }
  return groups.map((g) => {
    const first = DAY_NAMES[g.days[0]!]!;
    const lastName = DAY_NAMES[g.days.at(-1)!]!;
    const days =
      g.days.length === 1 ? first : g.days.length === 2 ? `${first} e ${lastName.toLowerCase()}` : `${first} a ${lastName.toLowerCase()}`;
    return { days, time: g.time, includes: g.days };
  });
}
