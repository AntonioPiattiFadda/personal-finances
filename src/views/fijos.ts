import { api } from '../api';
import type { Account, Frequency, RecurringItem, RecurringKind, Tag } from '../api/types';
import { accountOptions, bindTagPicker, empty, header, pickedTags, randomTagColor, tagChips, tagPicker } from '../ui/components';
import { amountInput, date, FREQUENCIES, money, parseAmount, signed, thisMonth } from '../ui/format';
import { confirmDialog, errorMessage, formDialog, run, toast } from '../ui/feedback';
import { html } from '../ui/html';
import { app } from '../ui/state';

/** Activo y vigente en algún momento del mes (YYYY-MM): solo para marcar la fila. */
function activeInMonth(r: RecurringItem, month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  return r.active && (!r.startDate || r.startDate <= last) && (!r.endDate || r.endDate >= first);
}

export async function fijos(root: HTMLElement) {
  const month = thisMonth();
  const [items, tags, accounts, allAccounts, summary] = await Promise.all([
    api.listRecurring(), api.listTags(), api.listAccounts(), api.listAccounts({ includeArchived: true }),
    api.getMonthSummary(month),
  ]);
  const { fixedIncome: fixedIn, fixedExpense: fixedOut } = summary;
  const accName = (id: string | null) => allAccounts.find(a => a.id === id)?.name ?? '';

  const table = (kind: RecurringKind) => {
    const list = items.filter(r => r.kind === kind);
    if (!list.length) return empty(kind === 'income' ? 'Sin ingresos fijos.' : 'Sin gastos fijos.');
    return html`<div class="table-wrap"><table>
      <thead><tr><th>Concepto</th><th class="hide-sm">Frecuencia</th><th class="r">Importe</th><th class="r">Al mes</th><th></th></tr></thead>
      <tbody>${list.map(r => {
        const inForce = activeInMonth(r, month);
        return html`<tr class="${inForce ? '' : 'paused'}">
          <td>
            <button type="button" class="link" data-edit="${r.id}" title="Editar"><strong>${r.name}</strong></button>
            ${!r.active ? html` <span class="badge">Pausado</span>` : !inForce ? html` <span class="badge">Fuera de fechas</span>` : ''}
            <div class="chips" style="margin-top:4px">${tagChips(r.tagIds, tags, false)}<span class="label">${accName(r.accountId)}</span>
              ${r.startDate || r.endDate ? html`<span class="label">${r.startDate ? `desde ${date(r.startDate)}` : ''} ${r.endDate ? `hasta ${date(r.endDate)}` : ''}</span>` : ''}</div>
          </td>
          <td class="hide-sm"><span class="badge">${FREQUENCIES[r.frequency]}</span></td>
          <td class="r num">${money(r.amount)}</td>
          <td class="r num"><strong>${money(r.monthlyAmount)}</strong></td>
          <td><button class="icon-btn del" data-delete="${r.id}" title="Borrar" aria-label="Borrar">✕</button></td>
        </tr>`;
      })}</tbody></table></div>`;
  };

  root.innerHTML = html`
    ${header('Ingresos y gastos fijos', 'Lo que entra y sale todos los meses (o cada tanto)', html`<button class="btn" data-new>+ Nuevo fijo</button>`)}
    <div class="stack">
      <div class="grid g3">
        <div class="card stat"><div class="label">Ingresos fijos / mes</div><div class="v pos">${signed(fixedIn)}</div></div>
        <div class="card stat"><div class="label">Gastos fijos / mes</div><div class="v neg">${signed(-fixedOut)}</div></div>
        <div class="card stat"><div class="label">Disponible para variables</div><div class="v ${summary.available < 0 ? 'neg' : ''}">${money(summary.available)}</div><div class="label">${money(summary.available * 12)} al año</div></div>
      </div>
      <section class="card"><h2>💰 Ingresos</h2>${table('income')}</section>
      <section class="card"><h2>🧾 Gastos fijos</h2>${table('expense')}</section>
      <p class="note">Los fijos son una previsión: no mueven el saldo de las cuentas. Solo cuentan los activos y vigentes este mes.</p>
    </div>`.value;

  root.querySelector('[data-new]')!.addEventListener('click', () => openRecurring(null, tags, accounts));
  root.addEventListener('click', async e => {
    const target = e.target as HTMLElement;
    const edit = target.closest<HTMLElement>('[data-edit]');
    if (edit) return openRecurring(items.find(r => r.id === edit.dataset.edit)!, tags, accounts);
    const del = target.closest<HTMLElement>('[data-delete]');
    if (!del) return;
    const item = items.find(r => r.id === del.dataset.delete)!;
    if (!(await confirmDialog(`¿Borrar «${item.name}»? Si solo quieres dejar de contarlo, puedes pausarlo.`))) return;
    if (await run(() => api.deleteRecurring(item.id), 'Borrado')) await app.refresh();
  });
}

function openRecurring(item: RecurringItem | null, tags: Tag[], accounts: Account[]) {
  formDialog({
    title: item ? 'Editar fijo' : 'Nuevo fijo',
    body: html`
      <div class="form-grid">
        <label class="f">Tipo<select name="kind">
          <option value="expense" ${item?.kind !== 'income' ? 'selected' : ''}>Gasto</option>
          <option value="income" ${item?.kind === 'income' ? 'selected' : ''}>Ingreso</option>
        </select></label>
        <label class="f">Concepto<input name="name" value="${item?.name ?? ''}" placeholder="Alquiler, nómina…" required></label>
        <label class="f">Importe<input name="amount" inputmode="decimal" value="${item ? amountInput(item.amount) : ''}" placeholder="0,00"></label>
        <label class="f">Frecuencia<select name="frequency">
          ${(Object.keys(FREQUENCIES) as Frequency[]).map(f => html`<option value="${f}" ${(item?.frequency ?? 'monthly') === f ? 'selected' : ''}>${FREQUENCIES[f]}</option>`)}
        </select></label>
        <label class="f">Cuenta<select name="account">${accountOptions(accounts, item?.accountId ?? null)}</select></label>
        <label class="f">Desde (opcional)<input type="date" name="startDate" value="${item?.startDate ?? ''}"></label>
        <label class="f">Hasta (opcional)<input type="date" name="endDate" value="${item?.endDate ?? ''}"></label>
        <label class="actions check" style="align-self:end;padding-bottom:10px"><input type="checkbox" name="active" ${item?.active === false ? '' : 'checked'}> Activo</label>
        <div class="full"><div class="label" style="margin-bottom:6px">Etiquetas</div>${tagPicker(tags, item?.tagIds ?? [])}</div>
      </div>`,
    onOpen: form => bindTagPicker(form, async name => {
      try {
        return await api.createTag(name, randomTagColor());
      } catch (e) {
        toast(errorMessage(e), 'error');
        return null;
      }
    }),
    async onSubmit(data, form) {
      const amount = parseAmount(String(data.get('amount')));
      if (!(amount > 0)) throw new Error('El importe debe ser un número mayor que 0');
      await api.saveRecurring(item?.id ?? null, {
        name: String(data.get('name') ?? ''),
        kind: data.get('kind') as RecurringKind,
        amount,
        frequency: data.get('frequency') as Frequency,
        accountId: String(data.get('account') ?? '') || null,
        active: data.get('active') === 'on',
        startDate: String(data.get('startDate') ?? '') || null,
        endDate: String(data.get('endDate') ?? '') || null,
        tagIds: pickedTags(form),
      });
      toast(item ? 'Cambios guardados' : 'Fijo creado');
      await app.refresh();
    },
  });
}
