// Formato de importes, porcentajes y fechas.
import type { AccountType, Frequency } from '../api/types';

let fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export function setCurrency(currency: string) {
  try {
    fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency });
  } catch {
    fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  }
}

export const money = (n: number) => fmt.format(n);
/** Con signo siempre visible (ganancias, diferencias). */
export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt.format(Math.abs(n));
export const pct = (n: number | null) =>
  n == null ? '—' : (n >= 0 ? '+' : '−') + Math.abs(n * 100).toFixed(1).replace('.', ',') + ' %';
export const cls = (n: number | null) => (n == null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '');

/** YYYY-MM-DD (o timestamp ISO) → dd/mm/aaaa */
export const date = (s: string) => s.slice(0, 10).split('-').reverse().join('/');

const pad = (n: number) => String(n).padStart(2, '0');
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const thisMonth = () => today().slice(0, 7);

export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
  return s[0].toUpperCase() + s.slice(1);
}

/** Lee un importe escrito a mano ("1.234,56", "12.5", "−8"). NaN si no es válido. */
export function parseAmount(s: string): number {
  let t = s.trim().replace(/\s|€|\$/g, '').replace('−', '-');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Math.round(Number(t) * 100) / 100 : NaN;
}

export const amountInput = (n: number) => n.toFixed(2).replace('.', ',');

export const ACCOUNT_TYPES: Record<AccountType, [string, string]> = {
  bank: ['Banco', '🏦'],
  cash: ['Efectivo', '💵'],
  savings: ['Ahorro', '🐷'],
  broker: ['Broker', '📈'],
  crypto: ['Cripto', '🪙'],
  other: ['Otro', '📁'],
};

export const FREQUENCIES: Record<Frequency, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  yearly: 'Anual',
};

export const NO_TAG_COLOR = '#868e96';
