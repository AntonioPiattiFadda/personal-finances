import { api } from '../api';
import type { Expense, ExpenseFilter, Tag } from '../api/types';
import { accountOptions, bindTagPicker, empty, pickedTags, randomTagColor, tagBars, tagChips, tagPicker } from '../ui/components';
import { amountInput, date, money, monthLabel, parseAmount, thisMonth, today } from '../ui/format';
import { confirmDialog, errorMessage, run, toast } from '../ui/feedback';
import { html } from '../ui/html';
import { app } from '../ui/state';

const NO_TAG = '__none';

// Filtros y última cuenta usada: se mantienen al navegar entre pantallas.
const state = { month: thisMonth(), tag: '', account: '', lastAccount: '', lastDate: '', editing: null as Expense | null };

export async function gastos(root: HTMLElement) {
  const filter: ExpenseFilter = {};
  if (state.month) filter.month = state.month;
  if (state.tag) filter.tagId = state.tag === NO_TAG ? null : state.tag;
  if (state.account) filter.accountId = state.account;
  const filtered = Boolean(state.tag || state.account);

  const [tags, accounts, allAccounts, list, monthList, byTag] = await Promise.all([
    api.listTags(), api.listAccounts(), api.listAccounts({ includeArchived: true }), api.listExpenses(filter),
    filtered ? api.listExpenses(state.month ? { month: state.month } : {}) : Promise.resolve(null),
    state.month ? api.expensesByTag(state.month) : Promise.resolve(null),
  ]);
  const periodList = monthList ?? list;
  const periodTotal = periodList.reduce((s, e) => s + e.amount, 0);
  const listTotal = list.reduce((s, e) => s + e.amount, 0);
  const accName = (id: string | null) => allAccounts.find(a => a.id === id)?.name ?? '—';

  const editing = state.editing;
  const accountId = editing ? editing.accountId : (state.lastAccount && accounts.some(a => a.id === state.lastAccount) ? state.lastAccount : accounts[0]?.id ?? null);

  root.innerHTML = html`
    <h1>Gastos variables</h1><p class="sub">Apunta cada gasto y etiquétalo como quieras</p>
    <div class="stack">
      <form class="card" id="expense-form" novalidate>
        <div class="between" style="margin-bottom:14px">
          <h2 style="margin:0">${editing ? 'Editar gasto' : 'Nuevo gasto'}</h2>
          ${editing ? html`<button type="button" class="btn ghost sm" data-cancel>Cancelar edición</button>` : ''}
        </div>
        <div class="fields">
          <label class="f">Importe<input class="amount" name="amount" placeholder="0,00" inputmode="decimal" autocomplete="off" value="${editing ? amountInput(editing.amount) : ''}"></label>
          <label class="f">Descripción<input name="description" placeholder="Mercadona, café, cine…" value="${editing?.description ?? ''}"></label>
          <label class="f">Fecha<input type="date" name="date" value="${editing?.date ?? (state.lastDate || today())}" required></label>
          <label class="f">Pagado desde<select name="account">${accountOptions(accounts, accountId)}</select></label>
        </div>
        <div style="margin-top:14px">
          <div class="label" style="margin-bottom:6px">Etiquetas</div>
          ${tagPicker(tags, editing?.tagIds ?? [])}
        </div>
        <div class="between" style="margin-top:16px">
          <label class="actions check"><input type="checkbox" name="deduct" ${(editing ? editing.deducted : true) ? 'checked' : ''}> Descontar del saldo de la cuenta</label>
          <button class="btn">${editing ? 'Guardar cambios' : 'Añadir gasto'}</button>
        </div>
      </form>
      <div class="grid side-layout">
        <section class="card">
          <div class="between" style="margin-bottom:10px">
            <h2 style="margin:0">Movimientos</h2>
            <div class="actions">
              <input type="month" id="f-month" value="${state.month}" aria-label="Mes" style="width:auto">
              <select id="f-tag" aria-label="Etiqueta" style="width:auto">
                <option value="">Todas las etiquetas</option>
                ${tags.map(t => html`<option value="${t.id}" ${state.tag === t.id ? 'selected' : ''}>${t.name}</option>`)}
                <option value="${NO_TAG}" ${state.tag === NO_TAG ? 'selected' : ''}>Sin etiqueta</option>
              </select>
              <select id="f-account" aria-label="Cuenta" style="width:auto" class="hide-sm">
                <option value="">Todas las cuentas</option>
                ${allAccounts.map(a => html`<option value="${a.id}" ${state.account === a.id ? 'selected' : ''}>${a.name}</option>`)}
              </select>
            </div>
          </div>
          ${list.length ? html`
            <div class="table-wrap"><table>
              <thead><tr><th>Fecha</th><th>Descripción</th><th class="hide-sm">Etiquetas</th><th class="hide-sm">Cuenta</th><th class="r">Importe</th><th></th></tr></thead>
              <tbody>${list.map(e => html`
                <tr class="${editing?.id === e.id ? 'editing' : ''}">
                  <td class="muted num">${state.month ? date(e.date).slice(0, 5) : date(e.date)}</td>
                  <td><button type="button" class="link" data-edit="${e.id}" title="Editar">${e.description || '(sin descripción)'}</button></td>
                  <td class="hide-sm"><div class="chips">${tagChips(e.tagIds, tags)}</div></td>
                  <td class="hide-sm muted">${accName(e.accountId)}${e.deducted ? html` <span title="Descontado del saldo">·&nbsp;descontado</span>` : ''}</td>
                  <td class="r num">${money(e.amount)}</td>
                  <td><button class="icon-btn del" data-delete="${e.id}" title="Borrar" aria-label="Borrar">✕</button></td>
                </tr>`)}
              </tbody>
            </table></div>
            ${filtered ? html`<p class="note">Filtrado: ${list.length} gastos · ${money(listTotal)}</p>` : ''}` : empty('No hay gastos con estos filtros.')}
        </section>
        <section class="card">
          <div class="label">${state.month ? `Total ${monthLabel(state.month).toLowerCase()}` : 'Total'}</div>
          <div class="big" style="font-size:28px">${money(periodTotal)}</div>
          <div class="label" style="margin-bottom:8px">${periodList.length} ${periodList.length === 1 ? 'gasto' : 'gastos'}</div>
          ${byTag ? tagBars(byTag) : html`<p class="note">Elige un mes para ver los totales por etiqueta.</p>`}
        </section>
      </div>
    </div>`.value;

  bindForm(root, tags, editing);
  bindList(root, list);
  if (!editing) root.querySelector<HTMLInputElement>('input.amount')!.focus({ preventScroll: true });
}

function bindForm(root: HTMLElement, tags: Tag[], editing: Expense | null) {
  const form = root.querySelector<HTMLFormElement>('#expense-form')!;
  const account = form.elements.namedItem('account') as HTMLSelectElement;
  const deduct = form.elements.namedItem('deduct') as HTMLInputElement;
  const syncDeduct = () => {
    deduct.disabled = !account.value;
    if (!account.value) deduct.checked = false;
  };
  account.addEventListener('change', () => { deduct.checked = !!account.value; syncDeduct(); });
  syncDeduct();

  bindTagPicker(form, async name => {
    try {
      const tag = await api.createTag(name, randomTagColor());
      tags.push(tag);
      return tag;
    } catch (e) {
      toast(errorMessage(e), 'error');
      return null;
    }
  });

  form.querySelector('[data-cancel]')?.addEventListener('click', () => { state.editing = null; app.refresh(); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(form);
    const amount = parseAmount(String(data.get('amount')));
    if (!(amount > 0)) {
      toast('El importe debe ser un número mayor que 0', 'error');
      form.querySelector<HTMLInputElement>('input.amount')!.focus();
      return;
    }
    const input = {
      date: String(data.get('date')),
      amount,
      description: String(data.get('description') ?? ''),
      accountId: account.value || null,
      tagIds: pickedTags(form),
      deduct: deduct.checked,
    };
    const ok = await run(
      () => (editing ? api.updateExpense(editing.id, input) : api.createExpense(input)),
      editing ? 'Gasto actualizado' : 'Gasto añadido',
    );
    if (!ok) return;
    state.editing = null;
    state.lastAccount = account.value;
    state.lastDate = input.date === today() ? '' : input.date;
    await app.refresh();
  });
}

function bindList(root: HTMLElement, list: Expense[]) {
  const onFilter = (fn: (v: string) => void) => (e: Event) => { fn((e.target as HTMLInputElement).value); app.refresh(); };
  root.querySelector('#f-month')!.addEventListener('change', onFilter(v => { state.month = v; }));
  root.querySelector('#f-tag')!.addEventListener('change', onFilter(v => { state.tag = v; }));
  root.querySelector('#f-account')!.addEventListener('change', onFilter(v => { state.account = v; }));

  root.querySelector('table')?.addEventListener('click', async e => {
    const target = e.target as HTMLElement;
    const edit = target.closest<HTMLElement>('[data-edit]');
    if (edit) {
      state.editing = list.find(x => x.id === edit.dataset.edit) ?? null;
      await app.refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const del = target.closest<HTMLElement>('[data-delete]');
    if (!del) return;
    const exp = list.find(x => x.id === del.dataset.delete)!;
    const extra = exp.deducted ? ' El importe se devolverá al saldo de la cuenta.' : '';
    if (!(await confirmDialog(`¿Borrar el gasto «${exp.description || 'sin descripción'}» de ${money(exp.amount)}?${extra}`))) return;
    if (await run(() => api.deleteExpense(exp.id), 'Gasto borrado')) {
      if (state.editing?.id === exp.id) state.editing = null;
      await app.refresh();
    }
  });
}
