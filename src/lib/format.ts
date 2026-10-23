const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  return brl.format(cents / 100);
}

/** Separa reais e centavos para a etiqueta de preço: { whole: "24", fraction: "90" }. */
export function splitPrice(cents: number): { whole: string; fraction: string } {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return { whole: whole.toLocaleString('pt-BR'), fraction };
}

/** Converte "24,90" ou "R$ 1.024,90" em centavos. Retorna null se inválido. */
export function parseBRLToCents(input: string): number | null {
  const clean = input.replace(/[R$\s]/g, '').trim();
  if (!clean) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(clean)) return null;
  const [intPart = '0', dec = ''] = clean.replace(/\./g, '').split(',');
  return Number(intPart) * 100 + Number(dec.padEnd(2, '0'));
}

export function centsToInput(cents: number | null): string {
  if (cents == null) return '';
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

const TZ = 'America/Sao_Paulo';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: TZ });
const shortFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ });

export function formatDateLong(iso: string): string {
  return dateFmt.format(new Date(iso));
}

export function formatDateShort(iso: string): string {
  return shortFmt.format(new Date(iso));
}

/** Texto curto de validade: "até 30/10", "a partir de 01/11". */
export function validityLabel(startsAt: string | null, endsAt: string | null, now = new Date()): string | null {
  if (startsAt && new Date(startsAt) > now) return `a partir de ${formatDateShort(startsAt)}`;
  if (endsAt) return `até ${formatDateShort(endsAt)}`;
  return null;
}

/** Promoção visível agora? (o banco já filtra; isso cobre o conteúdo de reserva) */
export function isPromotionActive(
  p: { published: boolean; starts_at: string | null; ends_at: string | null },
  now = new Date(),
): boolean {
  if (!p.published) return false;
  if (p.starts_at && new Date(p.starts_at) > now) return false;
  if (p.ends_at && new Date(p.ends_at) < now) return false;
  return true;
}
