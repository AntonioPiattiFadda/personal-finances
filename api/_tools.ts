// Las operaciones de FinanceApi expuestas por el MCP, repartidas en dos tools:
// `finance_read` (no cambia nada) y `finance_write` (crea, edita o borra).
// Cada operación valida sus parámetros con zod y llama al mismo FinanceApi que usa la web,
// así las reglas de negocio (RPC, RLS, mensajes de error) son las mismas.
// Archivo con `_`: Vercel no lo publica como función.
import * as z from 'zod'
import { ApiError, type FinanceApi } from '../src/api/types.js'

const id = z.uuid()
const date = z.iso.date().describe('YYYY-MM-DD')
const month = z.string().regex(/^\d{4}-\d{2}$/).describe('YYYY-MM')
const amount = z.number().positive()
const accountId = id.nullable()
const tagIds = z.array(id)
const accountType = z.enum(['bank', 'cash', 'savings', 'broker', 'crypto', 'other'])
const recurringFields = {
  name: z.string(),
  kind: z.enum(['income', 'expense']),
  amount,
  frequency: z.enum(['monthly', 'quarterly', 'semiannual', 'yearly']),
  accountId,
  active: z.boolean(),
  startDate: date.nullable(),
  endDate: date.nullable(),
  tagIds,
}
const expenseFields = {
  date,
  amount,
  description: z.string(),
  accountId,
  tagIds,
  deduct: z.boolean().describe('boolean (true = descuenta el importe del saldo de la cuenta)'),
}
const debtFields = {
  person: z.string(),
  direction: z.enum(['owed_to_me', 'i_owe']),
  amount,
  date,
  description: z.string(),
}

interface Operation<S extends z.ZodObject = z.ZodObject> {
  description: string
  params: S
  run: (api: FinanceApi, p: z.infer<S>) => Promise<unknown>
}

const op = <S extends z.ZodObject>(description: string, params: S, run: Operation<S>['run']): Operation =>
  ({ description, params, run: run as Operation['run'] })
const none = z.object({})

export const READ_OPERATIONS: Record<string, Operation> = {
  getCurrency: op('Moneda del usuario (código ISO).', none, api => api.getCurrency()),
  listTags: op('Etiquetas.', none, api => api.listTags()),
  listTagUsage: op('Etiquetas con nº de gastos, nº de fijos y total gastado (histórico).', none, api => api.listTagUsage()),
  listAccounts: op('Cuentas con su saldo.', z.object({ includeArchived: z.boolean().optional() }), (api, p) => api.listAccounts(p)),
  listExpenses: op(
    'Gastos variables, de más nuevo a más viejo.',
    z.object({ month: month.optional(), tagId: id.nullable().optional().describe('uuid | null = sin etiqueta'), accountId: id.optional() }),
    (api, p) => api.listExpenses(p),
  ),
  expensesByTag: op('Total de gastos de un mes por etiqueta.', z.object({ month }), (api, p) => api.expensesByTag(p.month)),
  listRecurring: op('Ingresos y gastos fijos con su equivalente mensual.', none, api => api.listRecurring()),
  listInvestments: op(
    'Inversiones con aportado, valor actual, ganancia y rentabilidad.',
    z.object({ includeArchived: z.boolean().optional() }),
    (api, p) => api.listInvestments(p),
  ),
  listContributions: op('Aportes de una inversión.', z.object({ investmentId: id }), (api, p) => api.listContributions(p.investmentId)),
  listValuations: op('Valoraciones de una inversión.', z.object({ investmentId: id }), (api, p) => api.listValuations(p.investmentId)),
  listDebts: op('Deudas (me deben / debo) con lo pagado y lo pendiente.', none, api => api.listDebts()),
  listDebtPayments: op('Pagos de una deuda.', z.object({ debtId: id }), (api, p) => api.listDebtPayments(p.debtId)),
  listDebtPeople: op('Saldo neto pendiente por persona.', none, api => api.listDebtPeople()),
  getNetWorth: op('Patrimonio: cuentas + inversiones + me deben − debo.', none, api => api.getNetWorth()),
  getMoneyByLocation: op('Dinero por cuenta (efectivo + inversiones).', none, api => api.getMoneyByLocation()),
  getMonthSummary: op('Resumen de un mes: fijos, disponible, gastado y lo que queda.', z.object({ month }), (api, p) => api.getMonthSummary(p.month)),
}

export const WRITE_OPERATIONS: Record<string, Operation> = {
  setCurrency: op('Cambia la moneda.', z.object({ currency: z.string().describe('código ISO de 3 letras') }), (api, p) => api.setCurrency(p.currency)),

  createTag: op('Crea una etiqueta.', z.object({ name: z.string(), color: z.string().describe('#rrggbb') }), (api, p) => api.createTag(p.name, p.color)),
  updateTag: op(
    'Renombra o cambia el color de una etiqueta.',
    z.object({ id, name: z.string().optional(), color: z.string().optional().describe('#rrggbb') }),
    (api, { id, ...patch }) => api.updateTag(id, patch),
  ),
  deleteTag: op('Borra una etiqueta (se quita de sus gastos y fijos).', z.object({ id }), (api, p) => api.deleteTag(p.id)),

  createAccount: op('Crea una cuenta.', z.object({ name: z.string(), type: accountType, balance: z.number() }), (api, p) => api.createAccount(p)),
  updateAccount: op(
    'Renombra, cambia el tipo o archiva una cuenta.',
    z.object({ id, name: z.string().optional(), type: accountType.optional(), archived: z.boolean().optional() }),
    (api, { id, ...patch }) => api.updateAccount(id, patch),
  ),
  setAccountBalance: op('Fija el saldo actual de una cuenta.', z.object({ id, balance: z.number() }), (api, p) => api.setAccountBalance(p.id, p.balance)),
  deleteAccount: op('Borra una cuenta sin movimientos (si tiene, hay que archivarla).', z.object({ id }), (api, p) => api.deleteAccount(p.id)),

  createExpense: op(
    'Registra un gasto variable. Devuelve su id.',
    z.object({
      ...expenseFields,
      description: expenseFields.description.default(''),
      accountId: accountId.default(null),
      tagIds: tagIds.default([]),
      deduct: expenseFields.deduct.default(false),
    }),
    (api, p) => api.createExpense(p),
  ),
  updateExpense: op(
    'Reemplaza un gasto entero: manda todos los campos (léelo antes con listExpenses).',
    z.object({ id, ...expenseFields }),
    (api, { id, ...input }) => api.updateExpense(id, input),
  ),
  deleteExpense: op('Borra un gasto (si descontó saldo, lo devuelve a la cuenta).', z.object({ id }), (api, p) => api.deleteExpense(p.id)),

  saveRecurring: op(
    'Crea (id null) o reemplaza entero (id) un ingreso/gasto fijo. Devuelve su id.',
    z.object({ id: id.nullable(), ...recurringFields }),
    (api, { id, ...input }) => api.saveRecurring(id, input),
  ),
  deleteRecurring: op('Borra un fijo.', z.object({ id }), (api, p) => api.deleteRecurring(p.id)),

  createInvestment: op(
    'Crea una inversión con su primer aporte. Devuelve su id.',
    z.object({ name: z.string(), accountId: accountId.default(null), amount, date }),
    (api, p) => api.createInvestment(p),
  ),
  updateInvestment: op(
    'Renombra, cambia la cuenta o archiva una inversión.',
    z.object({ id, name: z.string().optional(), accountId: accountId.optional(), archived: z.boolean().optional() }),
    (api, { id, ...patch }) => api.updateInvestment(id, patch),
  ),
  deleteInvestment: op('Borra una inversión con sus aportes y valoraciones.', z.object({ id }), (api, p) => api.deleteInvestment(p.id)),
  addContribution: op(
    'Añade un aporte (negativo = retirada). Crea su valoración automática. Devuelve su id.',
    z.object({ investmentId: id, date, amount: z.number().refine(n => n !== 0, 'No puede ser 0'), note: z.string().optional() }),
    (api, { investmentId, ...input }) => api.addContribution(investmentId, input),
  ),
  deleteContribution: op('Borra un aporte (y su valoración automática).', z.object({ id }), (api, p) => api.deleteContribution(p.id)),
  addValuation: op(
    'Registra el valor de una inversión en una fecha. Devuelve su id.',
    z.object({ investmentId: id, date, value: z.number().nonnegative() }),
    (api, { investmentId, ...input }) => api.addValuation(investmentId, input),
  ),
  deleteValuation: op('Borra una valoración.', z.object({ id }), (api, p) => api.deleteValuation(p.id)),

  createDebt: op(
    'Registra una deuda. Devuelve su id.',
    z.object({ ...debtFields, description: debtFields.description.default('') }),
    (api, p) => api.createDebt(p),
  ),
  updateDebt: op(
    'Edita una deuda (solo los campos enviados).',
    z.object({ id, ...z.object(debtFields).partial().shape }),
    (api, { id, ...patch }) => api.updateDebt(id, patch),
  ),
  deleteDebt: op('Borra una deuda y revierte en las cuentas lo que movieron sus pagos.', z.object({ id }), (api, p) => api.deleteDebt(p.id)),
  addDebtPayment: op(
    'Registra un pago parcial o total de una deuda; si lleva cuenta, ajusta su saldo. Devuelve su id.',
    z.object({ debtId: id, date, amount, accountId: accountId.default(null) }),
    (api, { debtId, ...input }) => api.addDebtPayment(debtId, input),
  ),
  deleteDebtPayment: op('Borra un pago de deuda y revierte el ajuste de saldo.', z.object({ id }), (api, p) => api.deleteDebtPayment(p.id)),
}

/** Tipo legible de un campo para la descripción de la tool: `uuid`, `bank|cash`, `YYYY-MM-DD`… */
function typeLabel(s: z.ZodType): string {
  if (s.description) return s.description
  if (s instanceof z.ZodOptional || s instanceof z.ZodDefault) return typeLabel(s.unwrap() as z.ZodType)
  if (s instanceof z.ZodNullable) return `${typeLabel(s.unwrap() as z.ZodType)} | null`
  if (s instanceof z.ZodEnum) return s.options.join('|')
  if (s instanceof z.ZodArray) return `${typeLabel(s.element as z.ZodType)}[]`
  if (s instanceof z.ZodUUID) return 'uuid'
  return s.def.type
}

/** Lista de operaciones con sus parámetros, para que el modelo sepa qué mandar en `params`. */
export function describeOperations(ops: Record<string, Operation>): string {
  return Object.entries(ops).map(([name, o]) => {
    const fields = Object.entries(o.params.shape as Record<string, z.ZodType>)
      .map(([k, s]) => `${k}${s.safeParse(undefined).success ? '?' : ''}: ${typeLabel(s)}`)
    return `- ${name}(${fields.join(', ')}): ${o.description}`
  }).join('\n')
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

const text = (value: unknown, isError = false): ToolResult =>
  ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }], ...(isError ? { isError } : {}) })

export async function runOperation(
  ops: Record<string, Operation>,
  api: FinanceApi,
  name: string,
  params: Record<string, unknown> | undefined,
): Promise<ToolResult> {
  const o = ops[name]
  if (!o) return text(`Operación desconocida: ${name}. Disponibles: ${Object.keys(ops).join(', ')}`, true)
  const parsed = o.params.safeParse(params ?? {})
  if (!parsed.success) return text(`Parámetros no válidos para ${name}:\n${z.prettifyError(parsed.error)}`, true)
  try {
    const result = await o.run(api, parsed.data)
    return text(result === undefined ? { ok: true } : result)
  } catch (e) {
    if (e instanceof ApiError) return text(e.message, true)
    throw e
  }
}
