// Implementación de FinanceApi sobre Supabase.
// De momento: perfil (moneda), cuentas y "dónde está la plata". El resto lanza ApiError.
import { supabase } from './client';
import type { Database } from './database.types';
import { ApiError, type Account, type FinanceApi, type MoneyByLocation } from './types';

type AccountRow = Database['public']['Tables']['accounts']['Row'];
type MoneyRow = Database['public']['Views']['v_money_by_location']['Row'];

interface PgError { code?: string; message: string }

function toApiError(error: PgError): ApiError {
  switch (error.code) {
    case 'P0001': return new ApiError(error.message, error.code); // raise exception de las RPC
    case '23505': return new ApiError('Ya existe un elemento con ese nombre', error.code);
    case '23503': return new ApiError('Tiene datos asociados y no se puede borrar', error.code);
    case '23514': return new ApiError('Algún dato no es válido', error.code);
    case '42501': return new ApiError('No tienes permiso para hacer esto', error.code);
    case 'PGRST301': return new ApiError('La sesión ha caducado. Vuelve a entrar.', error.code);
    default: return new ApiError('Error inesperado. Inténtalo de nuevo.', error.code);
  }
}

/** Tipo de `data` en la rama de éxito de una respuesta de Supabase. */
type OkData<R> = Extract<R, { error: null }> extends { data: infer D } ? D : never;

/** Desenvuelve la respuesta de Supabase o lanza ApiError. */
function unwrap<R extends { data: unknown; error: PgError | null }>(res: R): OkData<R> {
  if (res.error) throw toApiError(res.error);
  return res.data as OkData<R>;
}

const num = (v: number | string | null): number => (v == null ? 0 : Number(v));

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

const notYet = (): Promise<never> => Promise.reject(new ApiError('Esta función todavía no está disponible'));

export const api: FinanceApi = {
  // sesión y perfil
  async getCurrency() {
    const row = unwrap(await supabase.from('profiles').select('currency').maybeSingle());
    return row?.currency ?? 'EUR';
  },
  async setCurrency(currency) {
    const code = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) throw new ApiError('La moneda debe ser un código de 3 letras (ej. EUR)');
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new ApiError('No hay sesión iniciada');
    unwrap(await supabase.from('profiles').update({ currency: code }).eq('user_id', auth.user.id));
  },

  // etiquetas
  listTags: notYet,
  createTag: notYet,
  updateTag: notYet,
  deleteTag: notYet,

  // cuentas
  async listAccounts(opts) {
    let q = supabase.from('accounts').select('*').order('name');
    if (!opts?.includeArchived) q = q.eq('archived', false);
    return unwrap(await q).map(mapAccount);
  },
  async createAccount(input) {
    const name = input.name.trim();
    if (!name) throw new ApiError('El nombre es obligatorio');
    const row = unwrap(await supabase
      .from('accounts')
      .insert({ name, type: input.type, balance: input.balance })
      .select()
      .single());
    return mapAccount(row);
  },
  async updateAccount(id, patch) {
    const update: Database['public']['Tables']['accounts']['Update'] = {};
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new ApiError('El nombre es obligatorio');
      update.name = name;
    }
    if (patch.type !== undefined) update.type = patch.type;
    if (patch.archived !== undefined) update.archived = patch.archived;
    unwrap(await supabase.from('accounts').update(update).eq('id', id));
  },
  async setAccountBalance(id, balance) {
    if (!Number.isFinite(balance)) throw new ApiError('El saldo no es válido');
    unwrap(await supabase.rpc('set_account_balance', { p_account_id: id, p_balance: balance }));
  },
  async deleteAccount(id) {
    try {
      unwrap(await supabase.from('accounts').delete().eq('id', id));
    } catch (e) {
      if (e instanceof ApiError && e.code === '23503') {
        throw new ApiError('La cuenta tiene movimientos: archívala en lugar de borrarla', e.code);
      }
      throw e;
    }
  },

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
  async getMoneyByLocation() {
    const rows = unwrap(await supabase.from('v_money_by_location').select('*'));
    return rows.map(mapMoney).sort((a, b) => b.total - a.total);
  },
};
