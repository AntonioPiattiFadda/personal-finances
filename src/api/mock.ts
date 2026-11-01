// Implementación en memoria (localStorage) de FinanceApi y de la sesión, para trabajar sin Supabase.
// De momento: sesión y moneda. El resto lanza ApiError hasta que se implemente.
import type { Session } from './auth';
import { ApiError, type FinanceApi } from './types';

const SESSION_KEY = 'pf-mock-session';
const CURRENCY_KEY = 'pf-mock-currency';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin localStorage la sesión solo dura lo que la pestaña.
  }
}

// ---------------------------------------------------------------------------
// Sesión: en el mock "enviar el enlace" entra directamente.
// ---------------------------------------------------------------------------

let session: Session | null = read<Session>(SESSION_KEY);
const listeners = new Set<(s: Session | null) => void>();

function setSession(s: Session | null): void {
  session = s;
  write(SESSION_KEY, s);
  // Asíncrono, como en Supabase.
  setTimeout(() => listeners.forEach((cb) => cb(s)));
}

export const mockAuth = {
  async getSession(): Promise<Session | null> {
    return session;
  },
  async signIn(email: string): Promise<void> {
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new ApiError('El email no es válido');
    setSession({ userId: 'mock-user', email: clean });
  },
  async signOut(): Promise<void> {
    setSession(null);
  },
  onAuthChange(cb: (s: Session | null) => void): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  takeCallbackError(): string | null {
    return null;
  },
};

// ---------------------------------------------------------------------------
// FinanceApi
// ---------------------------------------------------------------------------

const notYet = (): Promise<never> => Promise.reject(new ApiError('Esta función todavía no está disponible'));

export const mockApi: FinanceApi = {
  // sesión y perfil
  async getCurrency() {
    return read<string>(CURRENCY_KEY) ?? 'EUR';
  },
  async setCurrency(currency) {
    const code = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw new ApiError('La moneda debe ser un código de 3 letras (ej. EUR)');
    write(CURRENCY_KEY, code);
  },

  // etiquetas
  listTags: notYet,
  createTag: notYet,
  updateTag: notYet,
  deleteTag: notYet,

  // cuentas
  listAccounts: notYet,
  createAccount: notYet,
  updateAccount: notYet,
  setAccountBalance: notYet,
  deleteAccount: notYet,

  // gastos variables
  listExpenses: notYet,
  createExpense: notYet,
  updateExpense: notYet,
  deleteExpense: notYet,
  expensesByTag: notYet,

  // fijos
  listRecurring: notYet,
  saveRecurring: notYet,
  deleteRecurring: notYet,

  // inversiones
  listInvestments: notYet,
  createInvestment: notYet,
  updateInvestment: notYet,
  deleteInvestment: notYet,
  listContributions: notYet,
  addContribution: notYet,
  deleteContribution: notYet,
  listValuations: notYet,
  addValuation: notYet,
  deleteValuation: notYet,

  // deudas
  listDebts: notYet,
  createDebt: notYet,
  updateDebt: notYet,
  deleteDebt: notYet,
  listDebtPayments: notYet,
  addDebtPayment: notYet,
  deleteDebtPayment: notYet,

  // resumen
  getNetWorth: notYet,
  getMoneyByLocation: notYet,
};
