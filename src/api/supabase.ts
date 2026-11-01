// Implementación de FinanceApi sobre Supabase.
// Lecturas desde tablas y vistas; todo lo que mueve saldos va por RPC.
// Recibe el cliente para servir igual al navegador (client.ts) y al servidor MCP (api/mcp.ts),
// que arma uno con el token del usuario. Por eso no importa client.ts y los imports llevan `.js`:
// las funciones de Vercel corren como ESM sin bundler.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';
import {
  ApiError,
  type Account,
  type Contribution,
  type Debt,
  type DebtPerson,
  type DebtPayment,
  type Expense,
  type FinanceApi,
  type Investment,
  type MoneyByLocation,
  type MonthSummary,
  type NetWorth,
  type RecurringItem,
  type Tag,
  type TagTotal,
  type TagUsage,
  type Valuation,
} from './types.js';

type Tables = Database['public']['Tables'];
type Views = Database['public']['Views'];
type AccountRow = Tables['accounts']['Row'];
type ContributionRow = Tables['investment_contributions']['Row'];
type ValuationRow = Tables['investment_valuations']['Row'];
type PaymentRow = Tables['debt_payments']['Row'];
type ExpenseRow = Views['v_expenses']['Row'];
type RecurringRow = Views['v_recurring_monthly']['Row'];
type InvestmentRow = Views['v_investment_stats']['Row'];
type DebtRow = Views['v_debt_balances']['Row'];
type TagTotalRow = Views['v_expenses_by_tag_month']['Row'];
type MoneyRow = Views['v_money_by_location']['Row'];
type NetWorthRow = Views['v_net_worth']['Row'];
type TagUsageRow = Views['v_tag_usage']['Row'];
type DebtPersonRow = Views['v_debt_people']['Row'];
type MonthSummaryRow = Database['public']['Functions']['get_month_summary']['Returns'][number];

interface PgError { code?: string; message: string }

function toApiError(error: PgError): ApiError {
  switch (error.code) {
    case 'P0001': return new ApiError(error.message, error.code); // raise exception de las RPC
    case '23505': return new ApiError('Ya existe un elemento con ese nombre', error.code);
    case '23503': return new ApiError('Tiene datos asociados y no se puede borrar', error.code);
    case '23514': return new ApiError('Algún dato no es válido', error.code);
    case '22P02': return new ApiError('Algún dato no tiene el formato correcto', error.code);
    case '42501': return new ApiError('No tienes permiso para hacer esto', error.code);
    case 'PGRST116': return new ApiError('El elemento no existe', error.code);
    case 'PGRST301': return new ApiError('La sesión ha caducado. Vuelve a entrar.', error.code);
    default: return new ApiError('Error inesperado. Inténtalo de nuevo.', error.code);
  }
}

/** Desenvuelve la respuesta de Supabase o lanza ApiError. */
function unwrap<R extends { data: unknown; error: PgError | null }>(res: R): Extract<R, { error: null }>['data'] {
  if (res.error) throw toApiError(res.error);
  return res.data;
}

const num = (v: number | string | null): number => (v == null ? 0 : Number(v));
const numOrNull = (v: number | string | null): number | null => (v == null ? null : Number(v));

/** Los tipos generados no marcan como opcionales los argumentos de las RPC, aunque aceptan null. */
const nullable = <T>(v: T | null): T => v as T;

/** 'YYYY-MM' → rango [primer día, primer día del mes siguiente). */
function monthRange(month: string): { from: string; to: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new ApiError('El mes no es válido (YYYY-MM)');
  const y = Number(m[1]);
  const next = Number(m[2]) === 12 ? `${y + 1}-01` : `${y}-${String(Number(m[2]) + 1).padStart(2, '0')}`;
  return { from: `${month}-01`, to: `${next}-01` };
}

function cleanName(name: string, what = 'El nombre'): string {
  const clean = name.trim();
  if (!clean) throw new ApiError(`${what} es obligatorio`);
  return clean;
}

function cleanColor(color: string): string {
  const clean = color.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(clean)) throw new ApiError('El color no es válido (#rrggbb)');
  return clean;
}

function mapAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    balance: num(r.balance),
    balanceUpdatedAt: r.balance_updated_at,
    archived: r.archived,
  };
}

function mapExpense(r: ExpenseRow): Expense {
  return {
    id: r.id ?? '',
    date: r.date ?? '',
    amount: num(r.amount),
    description: r.description ?? '',
    accountId: r.account_id,
    deducted: r.deducted ?? false,
    tagIds: r.tag_ids ?? [],
  };
}

function mapRecurring(r: RecurringRow): RecurringItem {
  return {
    id: r.recurring_item_id ?? '',
    name: r.name ?? '',
    kind: r.kind ?? 'expense',
    amount: num(r.amount),
    frequency: r.frequency ?? 'monthly',
    monthlyAmount: num(r.monthly_amount),
    accountId: r.account_id,
    active: r.active ?? true,
    startDate: r.start_date,
    endDate: r.end_date,
    tagIds: r.tag_ids ?? [],
  };
}

function mapInvestment(r: InvestmentRow): Investment {
  return {
    id: r.investment_id ?? '',
    name: r.name ?? '',
    accountId: r.account_id,
    archived: r.archived ?? false,
    invested: num(r.invested),
    currentValue: num(r.current_value),
    gain: num(r.gain),
    returnPct: numOrNull(r.return_pct),
    annualizedPct: numOrNull(r.annualized_pct),
    firstContributionDate: r.first_contribution_date,
    lastValuationDate: r.last_valuation_date,
  };
}

function mapContribution(r: ContributionRow): Contribution {
  return { id: r.id, investmentId: r.investment_id, date: r.date, amount: num(r.amount), note: r.note };
}

function mapValuation(r: ValuationRow): Valuation {
  return { id: r.id, investmentId: r.investment_id, date: r.date, value: num(r.value) };
}

function mapDebt(r: DebtRow): Debt {
  return {
    id: r.debt_id ?? '',
    person: r.person ?? '',
    direction: r.direction ?? 'owed_to_me',
    amount: num(r.amount),
    paid: num(r.paid),
    remaining: num(r.remaining),
    settled: r.settled ?? false,
    date: r.date ?? '',
    description: r.description ?? '',
  };
}

function mapPayment(r: PaymentRow): DebtPayment {
  return { id: r.id, debtId: r.debt_id, date: r.date, amount: num(r.amount), accountId: r.account_id };
}

function mapTagTotal(r: TagTotalRow): TagTotal {
  return {
    tagId: r.tag_id,
    tagName: r.tag_name ?? 'Sin etiqueta',
    tagColor: r.tag_color,
    total: num(r.total),
    count: num(r.count),
  };
}

function mapMoney(r: MoneyRow): MoneyByLocation {
  return {
    accountId: r.account_id,
    name: r.name ?? 'Sin ubicación',
    type: r.type,
    cash: num(r.cash),
    investments: num(r.investments),
    total: num(r.total),
  };
}

function mapNetWorth(r: NetWorthRow | null): NetWorth {
  return {
    accountsTotal: num(r?.accounts_total ?? null),
    investmentsTotal: num(r?.investments_total ?? null),
    investmentsInvested: num(r?.investments_invested ?? null),
    investmentsGain: num(r?.investments_gain ?? null),
    owedToMe: num(r?.owed_to_me ?? null),
    iOwe: num(r?.i_owe ?? null),
    netWorth: num(r?.net_worth ?? null),
  };
}

function mapTagUsage(r: TagUsageRow): TagUsage {
  return {
    tagId: r.tag_id ?? '',
    name: r.name ?? '',
    color: r.color ?? '',
    expenseCount: num(r.expense_count),
    recurringCount: num(r.recurring_count),
    expenseTotal: num(r.expense_total),
  };
}

function mapDebtPerson(r: DebtPersonRow): DebtPerson {
  return { person: r.person ?? '', owedToMe: num(r.owed_to_me), iOwe: num(r.i_owe), net: num(r.net) };
}

function mapMonthSummary(r: MonthSummaryRow): MonthSummary {
  return {
    month: r.month,
    fixedIncome: num(r.fixed_income),
    fixedExpense: num(r.fixed_expense),
    available: num(r.available),
    variableTotal: num(r.variable_total),
    variableCount: num(r.variable_count),
    remaining: num(r.remaining),
  };
}

/**
 * `currentUserId` devuelve el usuario de la sesión (o null). Se pasa aparte porque el cliente
 * del servidor MCP no guarda sesión: solo manda el token en cada request.
 */
export function createSupabaseApi(
  supabase: SupabaseClient<Database>,
  currentUserId: () => Promise<string | null>,
): FinanceApi {
  return {
    // sesión y perfil
    async getCurrency() {
      const row = unwrap(await supabase.from('profiles').select('currency').maybeSingle());
      return row?.currency ?? 'EUR';
    },
    async setCurrency(currency) {
      const code = currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(code)) throw new ApiError('La moneda debe ser un código de 3 letras (ej. EUR)');
      const userId = await currentUserId();
      if (!userId) throw new ApiError('No hay sesión iniciada');
      unwrap(await supabase.from('profiles').update({ currency: code }).eq('user_id', userId));
    },

    // etiquetas
    async listTags() {
      const rows = unwrap(await supabase.from('tags').select('id, name, color').order('name'));
      return rows.map((r): Tag => ({ id: r.id, name: r.name, color: r.color }));
    },
    async createTag(name, color) {
      const row = unwrap(await supabase
        .from('tags')
        .insert({ name: cleanName(name), color: cleanColor(color) })
        .select('id, name, color')
        .single());
      return { id: row.id, name: row.name, color: row.color };
    },
    async updateTag(id, patch) {
      const update: Tables['tags']['Update'] = {};
      if (patch.name !== undefined) update.name = cleanName(patch.name);
      if (patch.color !== undefined) update.color = cleanColor(patch.color);
      unwrap(await supabase.from('tags').update(update).eq('id', id));
    },
    async deleteTag(id) {
      unwrap(await supabase.from('tags').delete().eq('id', id));
    },
    async listTagUsage() {
      const rows = unwrap(await supabase.from('v_tag_usage').select('*').order('name'));
      return rows.map(mapTagUsage);
    },

    // cuentas
    async listAccounts(opts) {
      let q = supabase.from('accounts').select('*').order('name');
      if (!opts?.includeArchived) q = q.eq('archived', false);
      return unwrap(await q).map(mapAccount);
    },
    async createAccount(input) {
      if (!Number.isFinite(input.balance)) throw new ApiError('El saldo no es válido');
      const row = unwrap(await supabase
        .from('accounts')
        .insert({ name: cleanName(input.name), type: input.type, balance: input.balance })
        .select()
        .single());
      return mapAccount(row);
    },
    async updateAccount(id, patch) {
      const update: Tables['accounts']['Update'] = {};
      if (patch.name !== undefined) update.name = cleanName(patch.name);
      if (patch.type !== undefined) update.type = patch.type;
      if (patch.archived !== undefined) update.archived = patch.archived;
      unwrap(await supabase.from('accounts').update(update).eq('id', id));
    },
    async setAccountBalance(id, balance) {
      if (!Number.isFinite(balance)) throw new ApiError('El saldo no es válido');
      unwrap(await supabase.rpc('set_account_balance', { p_account_id: id, p_balance: balance }));
    },
    async deleteAccount(id) {
      // Si tiene movimientos, un trigger lo impide con un mensaje que pide archivarla.
      unwrap(await supabase.from('accounts').delete().eq('id', id));
    },

    // gastos variables
    async listExpenses(filter) {
      let q = supabase
        .from('v_expenses')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (filter?.month) {
        const { from, to } = monthRange(filter.month);
        q = q.gte('date', from).lt('date', to);
      }
      if (filter?.tagId === null) q = q.filter('tag_ids', 'eq', '{}');
      else if (filter?.tagId) q = q.contains('tag_ids', [filter.tagId]);
      if (filter?.accountId) q = q.eq('account_id', filter.accountId);
      return unwrap(await q).map(mapExpense);
    },
    async createExpense(input) {
      return unwrap(await supabase.rpc('create_expense', {
        p_date: input.date,
        p_amount: input.amount,
        p_description: input.description,
        p_account_id: nullable(input.accountId),
        p_tag_ids: input.tagIds,
        p_deduct: input.deduct,
      }));
    },
    async updateExpense(id, input) {
      unwrap(await supabase.rpc('update_expense', {
        p_id: id,
        p_date: input.date,
        p_amount: input.amount,
        p_description: input.description,
        p_account_id: nullable(input.accountId),
        p_tag_ids: input.tagIds,
        p_deduct: input.deduct,
      }));
    },
    async deleteExpense(id) {
      unwrap(await supabase.rpc('delete_expense', { p_id: id }));
    },
    async expensesByTag(month) {
      const rows = unwrap(await supabase
        .from('v_expenses_by_tag_month')
        .select('*')
        .eq('month', monthRange(month).from)
        .order('total', { ascending: false }));
      return rows.map(mapTagTotal);
    },

    // fijos
    async listRecurring() {
      const rows = unwrap(await supabase.from('v_recurring_monthly').select('*').order('name'));
      return rows.map(mapRecurring);
    },
    async saveRecurring(id, input) {
      return unwrap(await supabase.rpc('set_recurring_item', {
        p_id: nullable(id),
        p_name: input.name,
        p_kind: input.kind,
        p_amount: input.amount,
        p_frequency: input.frequency,
        p_account_id: nullable(input.accountId),
        p_active: input.active,
        p_start_date: nullable(input.startDate),
        p_end_date: nullable(input.endDate),
        p_tag_ids: input.tagIds,
      }));
    },
    async deleteRecurring(id) {
      unwrap(await supabase.from('recurring_items').delete().eq('id', id));
    },

    // inversiones
    async listInvestments(opts) {
      let q = supabase.from('v_investment_stats').select('*').order('name');
      if (!opts?.includeArchived) q = q.eq('archived', false);
      return unwrap(await q).map(mapInvestment);
    },
    async createInvestment(input) {
      return unwrap(await supabase.rpc('create_investment', {
        p_name: input.name,
        p_account_id: nullable(input.accountId),
        p_amount: input.amount,
        p_date: input.date,
      }));
    },
    async updateInvestment(id, patch) {
      const update: Tables['investments']['Update'] = {};
      if (patch.name !== undefined) update.name = cleanName(patch.name);
      if (patch.accountId !== undefined) update.account_id = patch.accountId;
      if (patch.archived !== undefined) update.archived = patch.archived;
      unwrap(await supabase.from('investments').update(update).eq('id', id));
    },
    async deleteInvestment(id) {
      unwrap(await supabase.from('investments').delete().eq('id', id));
    },
    async listContributions(investmentId) {
      const rows = unwrap(await supabase
        .from('investment_contributions')
        .select('*')
        .eq('investment_id', investmentId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }));
      return rows.map(mapContribution);
    },
    async addContribution(investmentId, input) {
      return unwrap(await supabase.rpc('add_contribution', {
        p_investment_id: investmentId,
        p_date: input.date,
        p_amount: input.amount,
        p_note: input.note ?? '',
      }));
    },
    async deleteContribution(id) {
      // Su valoración automática se borra en cascada.
      unwrap(await supabase.from('investment_contributions').delete().eq('id', id));
    },
    async listValuations(investmentId) {
      const rows = unwrap(await supabase
        .from('investment_valuations')
        .select('*')
        .eq('investment_id', investmentId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }));
      return rows.map(mapValuation);
    },
    async addValuation(investmentId, input) {
      if (!input.date) throw new ApiError('La fecha es obligatoria');
      if (!Number.isFinite(input.value) || input.value < 0) throw new ApiError('El valor no puede ser negativo');
      const row = unwrap(await supabase
        .from('investment_valuations')
        .insert({ investment_id: investmentId, date: input.date, value: input.value })
        .select('id')
        .single());
      return row.id;
    },
    async deleteValuation(id) {
      unwrap(await supabase.from('investment_valuations').delete().eq('id', id));
    },

    // deudas
    async listDebts() {
      const rows = unwrap(await supabase
        .from('v_debt_balances')
        .select('*')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }));
      return rows.map(mapDebt);
    },
    async createDebt(input) {
      if (!Number.isFinite(input.amount) || input.amount <= 0) throw new ApiError('El importe debe ser mayor que cero');
      if (!input.date) throw new ApiError('La fecha es obligatoria');
      const row = unwrap(await supabase
        .from('debts')
        .insert({
          person: cleanName(input.person, 'La persona'),
          direction: input.direction,
          amount: input.amount,
          description: input.description.trim(),
          date: input.date,
        })
        .select('id')
        .single());
      return row.id;
    },
    async updateDebt(id, patch) {
      const update: Tables['debts']['Update'] = {};
      if (patch.person !== undefined) update.person = cleanName(patch.person, 'La persona');
      if (patch.direction !== undefined) update.direction = patch.direction;
      if (patch.amount !== undefined) {
        if (!Number.isFinite(patch.amount) || patch.amount <= 0) throw new ApiError('El importe debe ser mayor que cero');
        update.amount = patch.amount;
      }
      if (patch.description !== undefined) update.description = patch.description.trim();
      if (patch.date !== undefined) update.date = patch.date;
      unwrap(await supabase.from('debts').update(update).eq('id', id));
    },
    async deleteDebt(id) {
      // RPC: revierte en las cuentas lo que movieron sus pagos.
      unwrap(await supabase.rpc('delete_debt', { p_id: id }));
    },
    async listDebtPayments(debtId) {
      const rows = unwrap(await supabase
        .from('debt_payments')
        .select('*')
        .eq('debt_id', debtId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }));
      return rows.map(mapPayment);
    },
    async addDebtPayment(debtId, input) {
      return unwrap(await supabase.rpc('add_debt_payment', {
        p_debt_id: debtId,
        p_date: input.date,
        p_amount: input.amount,
        p_account_id: nullable(input.accountId),
      }));
    },
    async deleteDebtPayment(id) {
      unwrap(await supabase.rpc('delete_debt_payment', { p_id: id }));
    },
    async listDebtPeople() {
      const rows = unwrap(await supabase.from('v_debt_people').select('*').or('owed_to_me.gt.0,i_owe.gt.0'));
      return rows.map(mapDebtPerson).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    },

    // resumen
    async getNetWorth() {
      return mapNetWorth(unwrap(await supabase.from('v_net_worth').select('*').maybeSingle()));
    },
    async getMoneyByLocation() {
      const rows = unwrap(await supabase.from('v_money_by_location').select('*'));
      return rows.map(mapMoney).sort((a, b) => b.total - a.total);
    },
    async getMonthSummary(month) {
      const rows = unwrap(await supabase.rpc('get_month_summary', { p_month: monthRange(month).from }));
      if (!rows.length) throw new ApiError('No se pudo calcular el resumen del mes');
      return mapMonthSummary(rows[0]);
    },
  };
}
