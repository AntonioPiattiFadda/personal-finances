import { api } from '../api';
import type { Account, AccountType } from '../api/types';
import { empty, header } from '../ui/components';
import { ACCOUNT_TYPES, amountInput, date, money, parseAmount } from '../ui/format';
import { confirmDialog, formDialog, run, toast } from '../ui/feedback';
import { html } from '../ui/html';
import { app } from '../ui/state';

export async function cuentas(root: HTMLElement) {
  const [all, net] = await Promise.all([api.listAccounts({ includeArchived: true }), api.getNetWorth()]);
  const active = all.filter(a => !a.archived);
  const archived = all.filter(a => a.archived);
  const groups = (Object.keys(ACCOUNT_TYPES) as AccountType[]).filter(t => active.some(a => a.type === t));

  root.innerHTML = html`
    ${header('Cuentas', 'Dónde tienes el dinero. Actualiza el saldo mirando tu banco.', html`<button class="btn" data-new>+ Nueva cuenta</button>`)}
    <div class="stack">
      <div class="card between">
        <div><div class="label">Total en cuentas</div><div class="big" style="font-size:28px">${money(net.accountsTotal)}</div></div>
        <span class="label">No incluye el valor de las inversiones</span>
      </div>
      ${groups.length ? html`<div class="grid g2">${groups.map(t => {
        const list = active.filter(a => a.type === t);
        return html`
          <section class="card">
            <div class="between"><h2>${ACCOUNT_TYPES[t][1]} ${ACCOUNT_TYPES[t][0]}</h2><span class="num muted">${money(list.reduce((s, a) => s + a.balance, 0))}</span></div>
            ${list.map(a => html`
              <div class="row">
                <div class="grow">
                  <button type="button" class="link" data-edit="${a.id}" title="Editar"><strong>${a.name}</strong></button>
                  <div class="label">Actualizado ${date(a.balanceUpdatedAt)}</div>
                </div>
                <input class="num" data-balance="${a.id}" value="${amountInput(a.balance)}" inputmode="decimal" aria-label="Saldo de ${a.name}" style="width:120px;text-align:right">
                <button class="icon-btn" data-archive="${a.id}" title="Archivar" aria-label="Archivar">🗄</button>
              </div>`)}
          </section>`;
      })}</div>` : html`<section class="card">${empty('Todavía no tienes cuentas. Crea la primera con «+ Nueva cuenta».')}</section>`}
      ${archived.length ? html`
        <details class="card"><summary style="margin:0">Archivadas (${archived.length})</summary>
          ${archived.map(a => html`
            <div class="row">
              <div class="grow"><strong>${a.name}</strong> <span class="badge">${ACCOUNT_TYPES[a.type][0]}</span><div class="label">${money(a.balance)} · no suma al patrimonio</div></div>
              <button class="btn ghost sm" data-unarchive="${a.id}">Restaurar</button>
              <button class="icon-btn del" data-delete="${a.id}" title="Borrar" aria-label="Borrar">✕</button>
            </div>`)}
        </details>` : ''}
    </div>`.value;

  const find = (id: string) => all.find(a => a.id === id)!;

  root.querySelector('[data-new]')!.addEventListener('click', () => openAccount(null));

  // Saldo editable inline: se guarda al pulsar Enter o al salir del campo si cambió.
  root.querySelectorAll<HTMLInputElement>('[data-balance]').forEach(input => {
    const account = find(input.dataset.balance!);
    const save = async () => {
      const value = parseAmount(input.value);
      if (Number.isNaN(value)) {
        toast('El saldo no es un número válido', 'error');
        input.value = amountInput(account.balance);
        return;
      }
      if (value === account.balance) return;
      if (await run(() => api.setAccountBalance(account.id, value), `Saldo de ${account.name} actualizado`)) await app.refresh();
      else input.value = amountInput(account.balance);
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = amountInput(account.balance); input.blur(); }
    });
    input.addEventListener('change', save);
  });

  root.addEventListener('click', async e => {
    const t = e.target as HTMLElement;
    const btn = t.closest<HTMLElement>('[data-edit],[data-archive],[data-unarchive],[data-delete]');
    if (!btn) return;
    const { edit, archive, unarchive, delete: del } = btn.dataset;
    if (edit) return openAccount(find(edit));
    if (archive) {
      const a = find(archive);
      if (!(await confirmDialog(`¿Archivar «${a.name}»? Dejará de sumar al patrimonio y de aparecer en los selectores.`, 'Archivar'))) return;
      if (await run(() => api.updateAccount(a.id, { archived: true }), 'Cuenta archivada')) await app.refresh();
    }
    if (unarchive && await run(() => api.updateAccount(unarchive, { archived: false }), 'Cuenta restaurada')) await app.refresh();
    if (del) {
      const a = find(del);
      if (!(await confirmDialog(`¿Borrar «${a.name}» definitivamente? Si tiene movimientos no se podrá borrar.`))) return;
      if (await run(() => api.deleteAccount(a.id), 'Cuenta borrada')) await app.refresh();
    }
  });
}

function openAccount(account: Account | null) {
  formDialog({
    title: account ? 'Editar cuenta' : 'Nueva cuenta',
    body: html`
      <div class="form-grid">
        <label class="f full">Nombre<input name="name" value="${account?.name ?? ''}" placeholder="N26, Billetera, Trade Republic…" required autofocus></label>
        <label class="f">Tipo<select name="type">
          ${(Object.keys(ACCOUNT_TYPES) as AccountType[]).map(t => html`<option value="${t}" ${(account?.type ?? 'bank') === t ? 'selected' : ''}>${ACCOUNT_TYPES[t][1]} ${ACCOUNT_TYPES[t][0]}</option>`)}
        </select></label>
        ${account ? '' : html`<label class="f">Saldo actual<input name="balance" inputmode="decimal" placeholder="0,00"></label>`}
      </div>`,
    async onSubmit(data) {
      const name = String(data.get('name') ?? '');
      const type = data.get('type') as AccountType;
      if (account) {
        await api.updateAccount(account.id, { name, type });
      } else {
        const raw = String(data.get('balance') ?? '').trim();
        const balance = raw ? parseAmount(raw) : 0;
        if (Number.isNaN(balance)) throw new Error('El saldo no es un número válido');
        await api.createAccount({ name, type, balance });
      }
      toast(account ? 'Cambios guardados' : 'Cuenta creada');
      await app.refresh();
    },
  });
}
