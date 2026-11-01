# Contrato de datos (frontend ↔ backend)

Fuente de verdad de lo que existe en Supabase y de lo que el frontend puede pedir. Cualquier cambio se hace **primero aquí** y en `src/api/types.ts`, en el mismo commit, antes de implementarlo.

## Tablas

Todas tienen `id uuid pk default gen_random_uuid()` (salvo tablas puente), `user_id uuid not null default auth.uid() references auth.users on delete cascade` y `created_at timestamptz not null default now()`.

| Tabla | Columnas propias |
|---|---|
| `profiles` | `user_id` (pk), `currency text not null default 'EUR'` |
| `tags` | `name text not null`, `color text not null` (check `^#[0-9a-f]{6}$`) · unique `(user_id, lower(name))` |
| `accounts` | `name text not null`, `type account_type not null`, `balance numeric(14,2) not null default 0`, `balance_updated_at timestamptz not null default now()`, `archived bool not null default false` |
| `expenses` | `date date not null`, `amount numeric(14,2) not null check > 0`, `description text not null default ''`, `account_id uuid null → accounts on delete set null`, `deducted bool not null default false` (check: `deducted` implica `account_id not null`) |
| `expense_tags` | `expense_id → expenses on delete cascade`, `tag_id → tags on delete cascade`, pk `(expense_id, tag_id)` |
| `recurring_items` | `name text not null`, `kind recurring_kind not null`, `amount numeric(14,2) not null check > 0`, `frequency recurring_frequency not null`, `account_id uuid null → accounts on delete set null`, `active bool not null default true`, `start_date date null`, `end_date date null` |
| `recurring_item_tags` | `recurring_item_id → recurring_items on delete cascade`, `tag_id → tags on delete cascade`, pk compuesta |
| `investments` | `name text not null`, `account_id uuid null → accounts on delete set null`, `archived bool not null default false` |
| `investment_contributions` | `investment_id → investments on delete cascade`, `date date not null`, `amount numeric(14,2) not null check <> 0`, `note text not null default ''` |
| `investment_valuations` | `investment_id → investments on delete cascade`, `date date not null`, `value numeric(14,2) not null check >= 0` |
| `debts` | `person text not null`, `direction debt_direction not null`, `amount numeric(14,2) not null check > 0`, `description text not null default ''`, `date date not null` |
| `debt_payments` | `debt_id → debts on delete cascade`, `date date not null`, `amount numeric(14,2) not null check > 0`, `account_id uuid null → accounts on delete set null` |

Enums:

- `account_type`: `bank`, `cash`, `savings`, `broker`, `crypto`, `other`
- `recurring_kind`: `income`, `expense`
- `recurring_frequency`: `monthly`, `quarterly`, `semiannual`, `yearly`
- `debt_direction`: `owed_to_me`, `i_owe`

Seguridad: RLS activado en todas las tablas, política `user_id = auth.uid()` para select/insert/update/delete. Las tablas puente comprueban la propiedad a través de la tabla padre.

## Vistas (todas `with (security_invoker = true)`)

| Vista | Una fila por | Columnas |
|---|---|---|
| `v_investment_stats` | inversión | `investment_id, name, account_id, archived, invested, current_value, gain, return_pct, annualized_pct, first_contribution_date, last_valuation_date` |
| `v_debt_balances` | deuda | `debt_id, person, direction, amount, paid, remaining, settled, date, description` |
| `v_net_worth` | usuario | `accounts_total, investments_total, owed_to_me, i_owe, net_worth` |
| `v_money_by_location` | cuenta (+ fila `account_id null` para "Sin ubicación") | `account_id, name, type, cash, investments, total` |
| `v_recurring_monthly` | elemento fijo | `recurring_item_id, name, kind, frequency, amount, monthly_amount, active` |
| `v_expenses_by_tag_month` | (mes, etiqueta) | `month` (date, día 1), `tag_id` (null = sin etiqueta), `tag_name, tag_color, total, count` |

## Funciones RPC

Hacen en una transacción lo que toca varias tablas o saldos. Devuelven el `id` creado (o `void`).

- `create_expense(p_date, p_amount, p_description, p_account_id, p_tag_ids uuid[], p_deduct bool) → uuid`
- `update_expense(p_id, p_date, p_amount, p_description, p_account_id, p_tag_ids uuid[], p_deduct bool) → void` — revierte y reaplica el descuento.
- `delete_expense(p_id) → void` — devuelve el importe a la cuenta si `deducted`.
- `set_recurring_item(p_id uuid null, p_name, p_kind, p_amount, p_frequency, p_account_id, p_active, p_start_date, p_end_date, p_tag_ids uuid[]) → uuid` — crea si `p_id` es null, si no actualiza.
- `create_investment(p_name, p_account_id, p_amount, p_date) → uuid` — aporte + valoración inicial.
- `add_contribution(p_investment_id, p_date, p_amount, p_note) → uuid` — aporte + valoración automática.
- `add_debt_payment(p_debt_id, p_date, p_amount, p_account_id) → uuid` — valida `amount <= remaining`, ajusta saldo de la cuenta.
- `delete_debt_payment(p_id) → void` — revierte el ajuste de saldo.
- `set_account_balance(p_account_id, p_balance) → void` — actualiza `balance` y `balance_updated_at`.

Lo demás (CRUD simple de tags, accounts, valuations, debts, investments) va directo a las tablas desde `src/api/supabase.ts`.

Errores de negocio: `raise exception` con mensaje en español apto para mostrar al usuario (ej. `'El pago supera lo pendiente'`).

## Interfaz TypeScript (`src/api/types.ts`)

El frontend solo conoce esto. Tipos en camelCase; la implementación Supabase hace el mapeo desde snake_case.

```ts
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
export interface NetWorth { accountsTotal: number; investmentsTotal: number; owedToMe: number; iOwe: number; netWorth: number }
export interface MoneyByLocation { accountId: string | null; name: string; type: AccountType | null; cash: number; investments: number; total: number }
export interface TagTotal { tagId: string | null; tagName: string; tagColor: string | null; total: number; count: number }

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

  // resumen
  getNetWorth(): Promise<NetWorth>;
  getMoneyByLocation(): Promise<MoneyByLocation[]>;
}
```

Errores: todas las funciones lanzan `ApiError` (`class ApiError extends Error { code?: string }`, exportada desde `src/api/types.ts`) con `message` en español listo para mostrar.

Autenticación: `src/api/auth.ts` (dueño: backend) expone `getSession(): Promise<Session | null>`, `signIn(email): Promise<void>` (envía el magic link; al volver del enlace la sesión se detecta sola en la URL), `signOut(): Promise<void>`, `onAuthChange(cb: (s: Session | null) => void): () => void` (devuelve la función para desuscribirse) y `takeCallbackError(): string | null` (motivo en español por el que falló el último enlace de acceso —caducado, ya usado, abierto en otro navegador—; se lee una sola vez, después de `getSession()`, y la URL ya queda limpia), con `interface Session { userId: string; email: string }` exportada desde el mismo archivo. Todas lanzan `ApiError`.

Selección en `src/api/index.ts`: la sesión es real siempre que estén `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (`usingMockAuth = false`); `VITE_USE_MOCK=true` solo pasa los **datos** al mock (`usingMock`). Así se puede entrar con un usuario real mientras el backend no implementa todo `FinanceApi`.

## Estado de la implementación Supabase

- Implementado: autenticación, perfil (`getCurrency`, `setCurrency`), cuentas (`listAccounts`, `createAccount`, `updateAccount`, `setAccountBalance`, `deleteAccount`) y `getMoneyByLocation` (de momento solo saldos: `investments = 0`, sin fila "Sin ubicación").
- El resto de métodos de `FinanceApi` lanzan `ApiError('Esta función todavía no está disponible')`.

## Pendientes

Peticiones de un agente al otro. Formato: `- [frontend→backend] descripción`. Se borran al resolverse.

- _(vacío)_
