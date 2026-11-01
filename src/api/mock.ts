// Implementación en memoria (guardada en localStorage) de FinanceApi y de la sesión, para trabajar sin Supabase.
// Respeta las mismas reglas, mensajes y órdenes que la base (docs/domain.md, supabase/migrations/).
import type { Session } from './auth';
import {
  ApiError,
  type Account, type AccountType, type Contribution, type Debt, type DebtDirection, type DebtPayment, type DebtPerson,
  type Expense, type ExpenseInput, type FinanceApi, type Frequency, type Investment, type MoneyByLocation, type MonthSummary,
  type RecurringInput, type RecurringItem, type Tag, type TagTotal, type TagUsage, type Valuation,
} from './types';

const SESSION_KEY = 'pf-mock-session';
const DB_KEY = 'pf-mock-db';

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
    // Sin localStorage los datos solo duran lo que la pestaña.
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
// Datos
// ---------------------------------------------------------------------------

// Filas "de tabla": lo que se guarda. Lo calculado (stats, pendiente…) se deriva al leer.
interface AccountRow { id: string; name: string; type: AccountType; balance: number; balanceUpdatedAt: string; archived: boolean; createdAt: string }
interface ExpenseRow { id: string; date: string; amount: number; description: string; accountId: string | null; deducted: boolean; tagIds: string[]; createdAt: string }
interface RecurringRow { id: string; name: string; kind: RecurringItem['kind']; amount: number; frequency: Frequency; accountId: string | null; active: boolean; startDate: string | null; endDate: string | null; tagIds: string[] }
interface InvestmentRow { id: string; name: string; accountId: string | null; archived: boolean }
interface ContributionRow extends Contribution { createdAt: string }
interface ValuationRow extends Valuation { contributionId: string | null; createdAt: string }
interface DebtRow { id: string; person: string; direction: DebtDirection; amount: number; description: string; date: string; createdAt: string }
interface PaymentRow extends DebtPayment { createdAt: string }

interface Db {
  currency: string;
  tags: Tag[];
  accounts: AccountRow[];
  expenses: ExpenseRow[];
  recurring: RecurringRow[];
  investments: InvestmentRow[];
  contributions: ContributionRow[];
  valuations: ValuationRow[];
  debts: DebtRow[];
  payments: PaymentRow[];
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
// Marca de creación estrictamente creciente, para desempatar órdenes como hace created_at.
let lastStamp = '';
function stamp(): string {
  let s = now();
  if (s <= lastStamp) s = new Date(new Date(lastStamp).getTime() + 1).toISOString();
  lastStamp = s;
  return s;
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));
/** Hace n días, pero sin salir del mes actual (para que el ejemplo se vea en "este mes"). */
const daysAgoThisMonth = (n: number) => {
  const d = new Date();
  return isoDay(new Date(d.getFullYear(), d.getMonth(), Math.max(1, d.getDate() - n)));
};

function seed(): Db {
  const t = (name: string, color: string): Tag => ({ id: uid(), name, color });
  const tags = [t('Supermercado', '#2f9e44'), t('Restaurantes', '#e8590c'), t('Transporte', '#1c7ed6'), t('Ocio', '#ae3ec9'), t('Casa', '#f08c00')];
  const acc = (name: string, type: AccountType, balance: number): AccountRow =>
    ({ id: uid(), name, type, balance, balanceUpdatedAt: now(), archived: false, createdAt: stamp() });
  const accounts = [acc('N26', 'bank', 2450), acc('Efectivo', 'cash', 180), acc('Trade Republic', 'broker', 320)];
  const exp = (days: number, amount: number, description: string, tagIdx: number[]): ExpenseRow =>
    ({ id: uid(), date: daysAgoThisMonth(days), amount, description, accountId: accounts[0].id, deducted: false, tagIds: tagIdx.map(i => tags[i].id), createdAt: stamp() });
  const invId = uid();
  const contribId = uid();
  return {
    currency: 'EUR',
    tags,
    accounts,
    expenses: [exp(1, 42.3, 'Compra semanal', [0]), exp(3, 28, 'Cena con amigos', [1, 3]), exp(6, 15.5, 'Abono transporte', [2])],
    recurring: [
      { id: uid(), name: 'Sueldo', kind: 'income', amount: 2200, frequency: 'monthly', accountId: accounts[0].id, active: true, startDate: null, endDate: null, tagIds: [] },
      { id: uid(), name: 'Alquiler', kind: 'expense', amount: 850, frequency: 'monthly', accountId: accounts[0].id, active: true, startDate: null, endDate: null, tagIds: [tags[4].id] },
      { id: uid(), name: 'Seguro del hogar', kind: 'expense', amount: 180, frequency: 'yearly', accountId: accounts[0].id, active: true, startDate: null, endDate: null, tagIds: [tags[4].id] },
    ],
    investments: [{ id: invId, name: 'ETF MSCI World', accountId: accounts[2].id, archived: false }],
    contributions: [{ id: contribId, investmentId: invId, date: daysAgo(200), amount: 1000, note: '', createdAt: stamp() }],
    valuations: [
      { id: uid(), investmentId: invId, date: daysAgo(200), value: 1000, contributionId: contribId, createdAt: stamp() },
      { id: uid(), investmentId: invId, date: daysAgo(10), value: 1086.4, contributionId: null, createdAt: stamp() },
    ],
    debts: [{ id: uid(), person: 'Lucía', direction: 'owed_to_me', amount: 60, description: 'Entradas del concierto', date: daysAgo(12), createdAt: stamp() }],
    payments: [],
  };
}

const db: Db = read<Db>(DB_KEY) ?? seed();
const save = () => write(DB_KEY, db);

/** Ejecuta una mutación como una transacción: si lanza, no queda nada a medias. */
function tx<T>(fn: () => T): T {
  const backup = JSON.stringify(db);
  try {
    const result = fn();
    save();
    return result;
  } catch (e) {
    Object.assign(db, JSON.parse(backup));
    throw e;
  }
}

const fail = (message: string): never => { throw new ApiError(message); };
const copy = <T>(v: T): T => structuredClone(v);

// ---------------------------------------------------------------------------
// Validaciones compartidas (mismos mensajes que la base)
// ---------------------------------------------------------------------------

function cleanName(name: string, message = 'El nombre es obligatorio'): string {
  const n = (name ?? '').trim();
  if (!n) fail(message);
  return n;
}

function checkDate(d: string | null | undefined): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) fail('La fecha es obligatoria');
  return d!;
}

function checkPositive(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) fail('El importe debe ser mayor que cero');
  return round2(amount);
}

function checkMonth(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(month ?? '');
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) fail('El mes no es válido (YYYY-MM)');
  return month;
}

function checkColor(color: string): string {
  const c = (color ?? '').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(c)) fail('El color no es válido (#rrggbb)');
  return c;
}

function findAccount(id: string): AccountRow {
  return db.accounts.find(a => a.id === id) ?? fail('La cuenta no existe');
}

/** Cuenta existente y no archivada (o null). */
function usableAccount(id: string | null): string | null {
  if (!id) return null;
  if (findAccount(id).archived) fail('La cuenta está archivada');
  return id;
}

function checkTags(ids: string[]): string[] {
  const unique = [...new Set(ids ?? [])];
  if (unique.some(id => !db.tags.some(t => t.id === id))) fail('Alguna etiqueta no existe');
  return unique;
}

/** Mueve el saldo sin tocar balanceUpdatedAt (eso solo cambia con la actualización manual). */
function adjustBalance(accountId: string | null, delta: number): void {
  if (!accountId || !delta) return;
  const a = findAccount(accountId);
  a.balance = round2(a.balance + delta);
}

function hasMovements(accountId: string): boolean {
  return db.expenses.some(e => e.accountId === accountId)
    || db.recurring.some(r => r.accountId === accountId)
    || db.investments.some(i => i.accountId === accountId)
    || db.payments.some(p => p.accountId === accountId);
}

const byDateDesc = <T extends { date: string; createdAt: string }>(a: T, b: T) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'es');

// ---------------------------------------------------------------------------
// Cálculos (lo que en Supabase hacen las vistas)
// ---------------------------------------------------------------------------

const FACTOR: Record<Frequency, number> = { monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12 };

function toRecurring(r: RecurringRow): RecurringItem {
  return { ...copy(r), monthlyAmount: round2(r.amount * FACTOR[r.frequency]) };
}

function lastValuation(investmentId: string): ValuationRow | undefined {
  return db.valuations.filter(v => v.investmentId === investmentId).sort(byDateDesc)[0];
}

function investmentStats(i: InvestmentRow): Investment {
  const contribs = db.contributions.filter(c => c.investmentId === i.id);
  const invested = round2(contribs.reduce((s, c) => s + c.amount, 0));
  const last = lastValuation(i.id);
  const currentValue = last?.value ?? 0;
  const gain = round2(currentValue - invested);
  const firstContributionDate = contribs.length ? contribs.map(c => c.date).sort()[0] : null;
  const lastValuationDate = last?.date ?? null;
  let annualizedPct: number | null = null;
  if (invested > 0 && firstContributionDate && lastValuationDate) {
    const days = (Date.parse(lastValuationDate) - Date.parse(firstContributionDate)) / 86_400_000;
    if (days >= 30) annualizedPct = Math.pow(currentValue / invested, 365 / days) - 1;
  }
  return {
    id: i.id, name: i.name, accountId: i.accountId, archived: i.archived,
    invested, currentValue, gain,
    returnPct: invested > 0 ? gain / invested : null,
    annualizedPct, firstContributionDate, lastValuationDate,
  };
}

function debtBalance(d: DebtRow): Debt {
  const paid = round2(db.payments.filter(p => p.debtId === d.id).reduce((s, p) => s + p.amount, 0));
  const remaining = round2(d.amount - paid);
  return { id: d.id, person: d.person, direction: d.direction, amount: d.amount, paid, remaining, settled: remaining <= 0, date: d.date, description: d.description };
}

/** Me pagan → suma, pago yo → resta. */
const paymentSign = (direction: DebtDirection) => (direction === 'owed_to_me' ? 1 : -1);

function expensesOfMonth(month: string): ExpenseRow[] {
  return db.expenses.filter(e => e.date.startsWith(month));
}

/** Activo y vigente en algún momento del mes. */
function activeInMonth(r: RecurringRow, month: string): boolean {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const last = isoDay(new Date(y, m, 0));
  return r.active && (!r.startDate || r.startDate <= last) && (!r.endDate || r.endDate >= first);
}

// ---------------------------------------------------------------------------
// FinanceApi
// ---------------------------------------------------------------------------

export const mockApi: FinanceApi = {
  // sesión y perfil
  async getCurrency() {
    return db.currency;
  },
  async setCurrency(currency) {
    const code = (currency ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) fail('La moneda debe ser un código de 3 letras (ej. EUR)');
    tx(() => { db.currency = code; });
  },

  // etiquetas
  async listTags() {
    return copy([...db.tags].sort(byName));
  },
  async createTag(name, color) {
    return tx(() => {
      const n = cleanName(name);
      const c = checkColor(color);
      if (db.tags.some(t => t.name.toLowerCase() === n.toLowerCase())) fail('Ya existe un elemento con ese nombre');
      const tag: Tag = { id: uid(), name: n, color: c };
      db.tags.push(tag);
      return copy(tag);
    });
  },
  async updateTag(id, patch) {
    tx(() => {
      const tag = db.tags.find(t => t.id === id) ?? fail('El elemento no existe');
      if (patch.name !== undefined) {
        const n = cleanName(patch.name);
        if (db.tags.some(t => t.id !== id && t.name.toLowerCase() === n.toLowerCase())) fail('Ya existe un elemento con ese nombre');
        tag.name = n;
      }
      if (patch.color !== undefined) tag.color = checkColor(patch.color);
    });
  },
  async deleteTag(id) {
    tx(() => {
      db.tags = db.tags.filter(t => t.id !== id);
      for (const e of db.expenses) e.tagIds = e.tagIds.filter(t => t !== id);
      for (const r of db.recurring) r.tagIds = r.tagIds.filter(t => t !== id);
    });
  },
  async listTagUsage() {
    return [...db.tags].sort(byName).map((t): TagUsage => {
      const expenses = db.expenses.filter(e => e.tagIds.includes(t.id));
      return {
        tagId: t.id, name: t.name, color: t.color,
        expenseCount: expenses.length,
        recurringCount: db.recurring.filter(r => r.tagIds.includes(t.id)).length,
        expenseTotal: round2(expenses.reduce((s, e) => s + e.amount, 0)),
      };
    });
  },

  // cuentas
  async listAccounts(opts) {
    return db.accounts
      .filter(a => opts?.includeArchived || !a.archived)
      .sort(byName)
      .map(({ createdAt: _, ...a }): Account => copy(a));
  },
  async createAccount(input) {
    return tx(() => {
      if (!Number.isFinite(input.balance)) fail('El saldo no es válido');
      const row: AccountRow = { id: uid(), name: cleanName(input.name), type: input.type, balance: round2(input.balance), balanceUpdatedAt: now(), archived: false, createdAt: stamp() };
      db.accounts.push(row);
      const { createdAt: _, ...account } = row;
      return copy(account);
    });
  },
  async updateAccount(id, patch) {
    tx(() => {
      const a = findAccount(id);
      if (patch.name !== undefined) a.name = cleanName(patch.name);
      if (patch.type !== undefined) a.type = patch.type;
      if (patch.archived !== undefined) a.archived = patch.archived;
    });
  },
  async setAccountBalance(id, balance) {
    tx(() => {
      if (!Number.isFinite(balance)) fail('El saldo no es válido');
      const a = findAccount(id);
      a.balance = round2(balance);
      a.balanceUpdatedAt = now();
    });
  },
  async deleteAccount(id) {
    tx(() => {
      findAccount(id);
      if (hasMovements(id)) fail('La cuenta tiene movimientos: archívala en lugar de borrarla');
      db.accounts = db.accounts.filter(a => a.id !== id);
    });
  },

  // gastos variables
  async listExpenses(filter) {
    let list = db.expenses;
    if (filter?.month) list = expensesOfMonth(checkMonth(filter.month));
    if (filter?.tagId === null) list = list.filter(e => e.tagIds.length === 0);
    else if (filter?.tagId) list = list.filter(e => e.tagIds.includes(filter.tagId!));
    if (filter?.accountId) list = list.filter(e => e.accountId === filter.accountId);
    return [...list].sort(byDateDesc).map(({ createdAt: _, ...e }): Expense => copy(e));
  },
  async createExpense(input) {
    return tx(() => {
      const e = validExpense(input);
      const row: ExpenseRow = { id: uid(), ...e, createdAt: stamp() };
      db.expenses.push(row);
      if (row.deducted) adjustBalance(row.accountId, -row.amount);
      return row.id;
    });
  },
  async updateExpense(id, input) {
    tx(() => {
      const row = db.expenses.find(e => e.id === id) ?? fail('El gasto no existe');
      // Revertir el descuento anterior antes de validar, por si la cuenta era la misma.
      if (row.deducted && row.accountId && db.accounts.some(a => a.id === row.accountId)) adjustBalance(row.accountId, row.amount);
      const e = validExpense(input, row.accountId);
      Object.assign(row, e);
      if (row.deducted) adjustBalance(row.accountId, -row.amount);
    });
  },
  async deleteExpense(id) {
    tx(() => {
      const row = db.expenses.find(e => e.id === id) ?? fail('El gasto no existe');
      if (row.deducted && row.accountId && db.accounts.some(a => a.id === row.accountId)) adjustBalance(row.accountId, row.amount);
      db.expenses = db.expenses.filter(e => e.id !== id);
    });
  },
  async expensesByTag(month) {
    const list = expensesOfMonth(checkMonth(month));
    const totals = new Map<string | null, TagTotal>();
    for (const e of list) {
      const keys: (string | null)[] = e.tagIds.length ? e.tagIds : [null];
      for (const key of keys) {
        const tag = key ? db.tags.find(t => t.id === key) : null;
        const row = totals.get(key) ?? { tagId: key, tagName: tag?.name ?? 'Sin etiqueta', tagColor: tag?.color ?? null, total: 0, count: 0 };
        row.total = round2(row.total + e.amount);
        row.count++;
        totals.set(key, row);
      }
    }
    return [...totals.values()].sort((a, b) => b.total - a.total);
  },

  // fijos
  async listRecurring() {
    return [...db.recurring].sort(byName).map(toRecurring);
  },
  async saveRecurring(id, input) {
    return tx(() => {
      const r = validRecurring(input);
      if (id === null) {
        const row: RecurringRow = { id: uid(), ...r };
        db.recurring.push(row);
        return row.id;
      }
      const row = db.recurring.find(x => x.id === id) ?? fail('El elemento fijo no existe');
      Object.assign(row, r);
      return row.id;
    });
  },
  async deleteRecurring(id) {
    tx(() => { db.recurring = db.recurring.filter(r => r.id !== id); });
  },

  // inversiones
  async listInvestments(opts) {
    return db.investments
      .filter(i => opts?.includeArchived || !i.archived)
      .sort(byName)
      .map(investmentStats);
  },
  async createInvestment(input) {
    return tx(() => {
      const name = cleanName(input.name);
      if (!Number.isFinite(input.amount) || input.amount <= 0) fail('El aporte inicial debe ser mayor que cero');
      const date = checkDate(input.date);
      const accountId = usableAccount(input.accountId);
      const inv: InvestmentRow = { id: uid(), name, accountId, archived: false };
      const amount = round2(input.amount);
      const c: ContributionRow = { id: uid(), investmentId: inv.id, date, amount, note: '', createdAt: stamp() };
      db.investments.push(inv);
      db.contributions.push(c);
      db.valuations.push({ id: uid(), investmentId: inv.id, date, value: amount, contributionId: c.id, createdAt: stamp() });
      return inv.id;
    });
  },
  async updateInvestment(id, patch) {
    tx(() => {
      const inv = db.investments.find(i => i.id === id) ?? fail('La inversión no existe');
      if (patch.name !== undefined) inv.name = cleanName(patch.name);
      if (patch.accountId !== undefined) inv.accountId = patch.accountId === inv.accountId ? inv.accountId : usableAccount(patch.accountId);
      if (patch.archived !== undefined) inv.archived = patch.archived;
    });
  },
  async deleteInvestment(id) {
    tx(() => {
      db.investments = db.investments.filter(i => i.id !== id);
      db.contributions = db.contributions.filter(c => c.investmentId !== id);
      db.valuations = db.valuations.filter(v => v.investmentId !== id);
    });
  },
  async listContributions(investmentId) {
    return db.contributions.filter(c => c.investmentId === investmentId).sort(byDateDesc)
      .map(({ createdAt: _, ...c }): Contribution => copy(c));
  },
  async addContribution(investmentId, input) {
    return tx(() => {
      const date = checkDate(input.date);
      if (!Number.isFinite(input.amount) || round2(input.amount) === 0) fail('El importe no puede ser cero');
      if (!db.investments.some(i => i.id === investmentId)) fail('La inversión no existe');
      const amount = round2(input.amount);
      const last = lastValuation(investmentId)?.value ?? 0;
      if (last + amount < 0) fail('La retirada supera el valor actual de la inversión');
      const c: ContributionRow = { id: uid(), investmentId, date, amount, note: (input.note ?? '').trim(), createdAt: stamp() };
      db.contributions.push(c);
      // Meter dinero no cuenta como ganancia: valoración automática = última + aporte.
      db.valuations.push({ id: uid(), investmentId, date, value: round2(last + amount), contributionId: c.id, createdAt: stamp() });
      return c.id;
    });
  },
  async deleteContribution(id) {
    tx(() => {
      // Su valoración automática se borra con él.
      db.contributions = db.contributions.filter(c => c.id !== id);
      db.valuations = db.valuations.filter(v => v.contributionId !== id);
    });
  },
  async listValuations(investmentId) {
    return db.valuations.filter(v => v.investmentId === investmentId).sort(byDateDesc)
      .map(({ createdAt: _c, contributionId: _id, ...v }): Valuation => copy(v));
  },
  async addValuation(investmentId, input) {
    return tx(() => {
      const date = checkDate(input.date);
      if (!Number.isFinite(input.value) || input.value < 0) fail('El valor no puede ser negativo');
      if (!db.investments.some(i => i.id === investmentId)) fail('La inversión no existe');
      const v: ValuationRow = { id: uid(), investmentId, date, value: round2(input.value), contributionId: null, createdAt: stamp() };
      db.valuations.push(v);
      return v.id;
    });
  },
  async deleteValuation(id) {
    tx(() => { db.valuations = db.valuations.filter(v => v.id !== id); });
  },

  // deudas
  async listDebts() {
    return [...db.debts].sort(byDateDesc).map(debtBalance);
  },
  async createDebt(input) {
    return tx(() => {
      const row: DebtRow = {
        id: uid(),
        person: cleanName(input.person, 'La persona es obligatoria'),
        direction: input.direction,
        amount: checkPositive(input.amount),
        description: (input.description ?? '').trim(),
        date: checkDate(input.date),
        createdAt: stamp(),
      };
      db.debts.push(row);
      return row.id;
    });
  },
  async updateDebt(id, patch) {
    tx(() => {
      const row = db.debts.find(d => d.id === id) ?? fail('La deuda no existe');
      const { paid } = debtBalance(row);
      if (patch.person !== undefined) row.person = cleanName(patch.person, 'La persona es obligatoria');
      if (patch.amount !== undefined) {
        const amount = checkPositive(patch.amount);
        if (amount < paid) fail('El importe no puede ser menor que lo ya pagado');
        row.amount = amount;
      }
      if (patch.direction !== undefined && patch.direction !== row.direction) {
        if (paid > 0) fail('No se puede cambiar el sentido de una deuda que ya tiene pagos');
        row.direction = patch.direction;
      }
      if (patch.description !== undefined) row.description = patch.description.trim();
      if (patch.date !== undefined) row.date = checkDate(patch.date);
    });
  },
  async deleteDebt(id) {
    tx(() => {
      const row = db.debts.find(d => d.id === id) ?? fail('La deuda no existe');
      for (const p of db.payments.filter(x => x.debtId === id)) {
        if (p.accountId && db.accounts.some(a => a.id === p.accountId)) adjustBalance(p.accountId, -paymentSign(row.direction) * p.amount);
      }
      db.payments = db.payments.filter(p => p.debtId !== id);
      db.debts = db.debts.filter(d => d.id !== id);
    });
  },
  async listDebtPayments(debtId) {
    return db.payments.filter(p => p.debtId === debtId).sort(byDateDesc)
      .map(({ createdAt: _, ...p }): DebtPayment => copy(p));
  },
  async addDebtPayment(debtId, input) {
    return tx(() => {
      const date = checkDate(input.date);
      const amount = checkPositive(input.amount);
      const debt = db.debts.find(d => d.id === debtId) ?? fail('La deuda no existe');
      const { remaining } = debtBalance(debt);
      if (remaining <= 0) fail('La deuda ya está saldada');
      if (amount > remaining) fail('El pago supera lo pendiente');
      const accountId = usableAccount(input.accountId);
      const p: PaymentRow = { id: uid(), debtId, date, amount, accountId, createdAt: stamp() };
      db.payments.push(p);
      adjustBalance(accountId, paymentSign(debt.direction) * amount);
      return p.id;
    });
  },
  async deleteDebtPayment(id) {
    tx(() => {
      const p = db.payments.find(x => x.id === id) ?? fail('El pago no existe');
      const debt = db.debts.find(d => d.id === p.debtId);
      if (debt && p.accountId && db.accounts.some(a => a.id === p.accountId)) adjustBalance(p.accountId, -paymentSign(debt.direction) * p.amount);
      db.payments = db.payments.filter(x => x.id !== id);
    });
  },
  async listDebtPeople() {
    const people = new Map<string, DebtPerson>();
    for (const d of db.debts.map(debtBalance)) {
      const key = d.person.trim().toLowerCase();
      const row = people.get(key) ?? { person: d.person.trim(), owedToMe: 0, iOwe: 0, net: 0 };
      if (d.person.trim() < row.person) row.person = d.person.trim();
      if (d.direction === 'owed_to_me') row.owedToMe = round2(row.owedToMe + d.remaining);
      else row.iOwe = round2(row.iOwe + d.remaining);
      row.net = round2(row.owedToMe - row.iOwe);
      people.set(key, row);
    }
    return [...people.values()].filter(p => p.owedToMe || p.iOwe).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  },

  // resumen
  async getNetWorth() {
    const accountsTotal = round2(db.accounts.filter(a => !a.archived).reduce((s, a) => s + a.balance, 0));
    const stats = db.investments.filter(i => !i.archived).map(investmentStats);
    const investmentsTotal = round2(stats.reduce((s, i) => s + i.currentValue, 0));
    const investmentsInvested = round2(stats.reduce((s, i) => s + i.invested, 0));
    const debts = db.debts.map(debtBalance);
    const owedToMe = round2(debts.filter(d => d.direction === 'owed_to_me').reduce((s, d) => s + d.remaining, 0));
    const iOwe = round2(debts.filter(d => d.direction === 'i_owe').reduce((s, d) => s + d.remaining, 0));
    return {
      accountsTotal, investmentsTotal, investmentsInvested,
      investmentsGain: round2(investmentsTotal - investmentsInvested),
      owedToMe, iOwe,
      netWorth: round2(accountsTotal + investmentsTotal + owedToMe - iOwe),
    };
  },
  async getMoneyByLocation() {
    const active = db.accounts.filter(a => !a.archived);
    const byAccount = new Map<string | null, number>();
    for (const i of db.investments.filter(x => !x.archived)) {
      const key = i.accountId && active.some(a => a.id === i.accountId) ? i.accountId : null;
      byAccount.set(key, round2((byAccount.get(key) ?? 0) + investmentStats(i).currentValue));
    }
    const rows = active.map((a): MoneyByLocation => {
      const investments = byAccount.get(a.id) ?? 0;
      return { accountId: a.id, name: a.name, type: a.type, cash: a.balance, investments, total: round2(a.balance + investments) };
    });
    if (byAccount.has(null)) {
      const v = byAccount.get(null)!;
      rows.push({ accountId: null, name: 'Sin ubicación', type: null, cash: 0, investments: v, total: v });
    }
    return rows.sort((a, b) => b.total - a.total);
  },
  async getMonthSummary(month) {
    checkMonth(month);
    const current = db.recurring.filter(r => activeInMonth(r, month)).map(toRecurring);
    const fixedIncome = round2(current.filter(r => r.kind === 'income').reduce((s, r) => s + r.monthlyAmount, 0));
    const fixedExpense = round2(current.filter(r => r.kind === 'expense').reduce((s, r) => s + r.monthlyAmount, 0));
    const expenses = expensesOfMonth(month);
    const variableTotal = round2(expenses.reduce((s, e) => s + e.amount, 0));
    const available = round2(fixedIncome - fixedExpense);
    const summary: MonthSummary = {
      month: `${month}-01`, fixedIncome, fixedExpense, available,
      variableTotal, variableCount: expenses.length, remaining: round2(available - variableTotal),
    };
    return summary;
  },
};

function validExpense(input: ExpenseInput, previousAccountId: string | null = null): Omit<ExpenseRow, 'id' | 'createdAt'> {
  const date = checkDate(input.date);
  const amount = checkPositive(input.amount);
  if (input.deduct && !input.accountId) fail('Para descontar el gasto hay que elegir una cuenta');
  // Se puede dejar la cuenta que ya tenía aunque esté archivada; una nueva tiene que estar activa.
  const accountId = input.accountId && input.accountId === previousAccountId ? (findAccount(input.accountId), input.accountId) : usableAccount(input.accountId);
  return { date, amount, description: (input.description ?? '').trim(), accountId, deducted: Boolean(input.deduct && accountId), tagIds: checkTags(input.tagIds) };
}

function validRecurring(input: RecurringInput): Omit<RecurringRow, 'id'> {
  const name = cleanName(input.name);
  if (input.kind !== 'income' && input.kind !== 'expense') fail('Indica si es un ingreso o un gasto');
  const amount = checkPositive(input.amount);
  if (!(input.frequency in FACTOR)) fail('La frecuencia es obligatoria');
  if (input.startDate && input.endDate && input.endDate < input.startDate) fail('La fecha de fin no puede ser anterior a la de inicio');
  if (input.accountId) findAccount(input.accountId);
  return {
    name, kind: input.kind, amount, frequency: input.frequency, accountId: input.accountId || null,
    active: input.active, startDate: input.startDate || null, endDate: input.endDate || null, tagIds: checkTags(input.tagIds),
  };
}
