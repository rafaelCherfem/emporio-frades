import type { DayHours } from './schemas';

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

/**
 * Status em linguagem natural: "Aberto agora, fecha às 21h" / "Fechado, abre amanhã às 8h".
 * Suporta horário que passa da meia-noite (ex.: 18:00–02:00).
 */
export function openStatus(hours: DayHours[], now = new Date()): OpenStatus {
  const { day, minutes } = storeClock(now);
  const byDay = new Map(hours.map((h) => [h.day, h]));

  const today = byDay.get(day);
  const yesterday = byDay.get((day + 6) % 7);

  // Expediente de ontem que atravessou a meia-noite
  if (yesterday && !yesterday.closed) {
    const o = toMinutes(yesterday.open);
    const c = toMinutes(yesterday.close);
    if (c < o && minutes < c) return { open: true, label: `Aberto agora, fecha às ${fmtHour(yesterday.close)}` };
  }

  if (today && !today.closed) {
    const o = toMinutes(today.open);
    const c = toMinutes(today.close);
    const overnight = c < o;
    if (minutes >= o && (overnight || minutes < c)) {
      return { open: true, label: `Aberto agora, fecha às ${fmtHour(today.close)}` };
    }
    if (minutes < o) return { open: false, label: `Fechado, abre hoje às ${fmtHour(today.open)}` };
  }

  for (let i = 1; i <= 7; i++) {
    const next = byDay.get((day + i) % 7);
    if (next && !next.closed) {
      const when = i === 1 ? 'amanhã' : DAY_NAMES[next.day]!.toLowerCase();
      return { open: false, label: `Fechado, abre ${when} às ${fmtHour(next.open)}` };
    }
  }
  return { open: false, label: 'Fechado' };
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
