// Contrato compartido frontend ↔ backend. Solo se cambia junto con docs/data-contract.md.

export type AccountType = 'bank' | 'cash' | 'savings' | 'broker' | 'crypto' | 'other';
export type RecurringKind = 'income' | 'expense';
export type Frequency = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
export type DebtDirection = 'owed_to_me' | 'i_owe';

export interface Tag { id: string; name: string; color: string }
export interface Account { id: string; name: string; type: AccountType; balance: number; balanceUpdatedAt: string; archived: boolean }
export interface Expense { id: string; date: string; amount: number; description: string; accountId: string | null; deducted: boolean; tagIds: string[] }
export interface RecurringItem { id: string; name: string; kind: RecurringKind; amount: number; frequency: Frequency; monthlyAmount: number; accountId: string | null; active: boolean; startDate: string | null; endDate: string | null; tagIds: string[] }
export interface Investment { id: string; name: string; accountId: string | null; archived: boolean; invested: number; currentValue: number; gain: number; returnPct: number | null; annualizedPct: number | null; firstContributionDate: string | null; lastValuationDate: string | null }
export interface Contribution { id: string; investmentId: string; date: string; amount: number; note: string }
export interface Valuation { id: string; investmentId: string; date: string; value: number }
export interface Debt { id: string; person: string; direction: DebtDirection; amount: number; paid: number; remaining: number; settled: boolean; date: string; description: string }
export interface DebtPayment { id: string; debtId: string; date: string; amount: number; accountId: string | null }
export interface NetWorth { accountsTotal: number; investmentsTotal: number; investmentsInvested: number; investmentsGain: number; owedToMe: number; iOwe: number; netWorth: number }
export interface MoneyByLocation { accountId: string | null; name: string; type: AccountType | null; cash: number; investments: number; total: number }
export interface TagTotal { tagId: string | null; tagName: string; tagColor: string | null; total: number; count: number }
export interface TagUsage { tagId: string; name: string; color: string; expenseCount: number; recurringCount: number; expenseTotal: number }
export interface MonthSummary { month: string /* YYYY-MM-01 */; fixedIncome: number; fixedExpense: number; available: number; variableTotal: number; variableCount: number; remaining: number }
export interface DebtPerson { person: string; owedToMe: number; iOwe: number; net: number }

export interface ExpenseInput { date: string; amount: number; description: string; accountId: string | null; tagIds: string[]; deduct: boolean }
export interface ExpenseFilter { month?: string /* YYYY-MM */; tagId?: string | null /* null = sin etiqueta */; accountId?: string }
export type RecurringInput = Omit<RecurringItem, 'id' | 'monthlyAmount'>;
export type DebtInput = Omit<Debt, 'id' | 'paid' | 'remaining' | 'settled'>;

export interface FinanceApi {
  // sesión y perfil
  getCurrency(): Promise<string>;
  setCurrency(currency: string): Promise<void>;

  // etiquetas
  listTags(): Promise<Tag[]>;
  createTag(name: string, color: string): Promise<Tag>;
  updateTag(id: string, patch: Partial<Pick<Tag, 'name' | 'color'>>): Promise<void>;
  deleteTag(id: string): Promise<void>;
  listTagUsage(): Promise<TagUsage[]>; // orden: nombre

  // cuentas
  listAccounts(opts?: { includeArchived?: boolean }): Promise<Account[]>;
  createAccount(input: { name: string; type: AccountType; balance: number }): Promise<Account>;
  updateAccount(id: string, patch: Partial<Pick<Account, 'name' | 'type' | 'archived'>>): Promise<void>;
  setAccountBalance(id: string, balance: number): Promise<void>;
  deleteAccount(id: string): Promise<void>; // falla si tiene movimientos → archivar

  // gastos variables
  listExpenses(filter?: ExpenseFilter): Promise<Expense[]>; // orden: fecha desc
  createExpense(input: ExpenseInput): Promise<string>;
  updateExpense(id: string, input: ExpenseInput): Promise<void>;
  deleteExpense(id: string): Promise<void>;
  expensesByTag(month: string /* YYYY-MM */): Promise<TagTotal[]>; // orden: total desc

  // fijos
  listRecurring(): Promise<RecurringItem[]>;
  saveRecurring(id: string | null, input: RecurringInput): Promise<string>;
  deleteRecurring(id: string): Promise<void>;

  // inversiones
  listInvestments(opts?: { includeArchived?: boolean }): Promise<Investment[]>;
  createInvestment(input: { name: string; accountId: string | null; amount: number; date: string }): Promise<string>;
  updateInvestment(id: string, patch: { name?: string; accountId?: string | null; archived?: boolean }): Promise<void>;
  deleteInvestment(id: string): Promise<void>;
  listContributions(investmentId: string): Promise<Contribution[]>;
  addContribution(investmentId: string, input: { date: string; amount: number; note?: string }): Promise<string>;
  deleteContribution(id: string): Promise<void>;
  listValuations(investmentId: string): Promise<Valuation[]>;
  addValuation(investmentId: string, input: { date: string; value: number }): Promise<string>;
  deleteValuation(id: string): Promise<void>;

  // deudas
  listDebts(): Promise<Debt[]>;
  createDebt(input: DebtInput): Promise<string>;
  updateDebt(id: string, patch: Partial<DebtInput>): Promise<void>;
  deleteDebt(id: string): Promise<void>;
  listDebtPayments(debtId: string): Promise<DebtPayment[]>;
  addDebtPayment(debtId: string, input: { date: string; amount: number; accountId: string | null }): Promise<string>;
  deleteDebtPayment(id: string): Promise<void>;
  listDebtPeople(): Promise<DebtPerson[]>; // solo personas con algo pendiente; orden: |net| desc

  // resumen
  getNetWorth(): Promise<NetWorth>;
  getMoneyByLocation(): Promise<MoneyByLocation[]>; // orden: total desc
  getMonthSummary(month: string /* YYYY-MM */): Promise<MonthSummary>;
}

export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}
