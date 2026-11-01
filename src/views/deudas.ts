import { api } from '../api';
import type { Account, Debt, DebtDirection } from '../api/types';
import { accountOptions, avatar, bar, empty, header } from '../ui/components';
import { amountInput, cls, date, money, parseAmount, signed, today } from '../ui/format';
import { confirmDialog, formDialog, run, toast } from '../ui/feedback';
import { html, type Html } from '../ui/html';
import { app } from '../ui/state';

const personKey = (p: string) => p.trim().toLowerCase();

export async function deudas(root: HTMLElement) {
  const [debts, accounts, allAccounts] = await Promise.all([api.listDebts(), api.listAccounts(), api.listAccounts({ includeArchived: true })]);
  const active = debts.filter(d => !d.settled);
  const settled = debts.filter(d => d.settled);
  const total = (dir: DebtDirection) => active.filter(d => d.direction === dir).reduce((s, d) => s + d.remaining, 0);
  const people = [...new Set(debts.map(d => d.person.trim()))];
  const accName = (id: string | null) => allAccounts.find(a => a.id === id)?.name;

  const debtRow = (d: Debt) => html`
    <div class="row">
      <div class="grow">
        <button type="button" class="link" data-edit="${d.id}" title="Editar">${d.description || 'Sin descripción'}</button>
        <div class="label">${date(d.date)}${d.paid ? ` · pagado ${money(d.paid)} de ${money(d.amount)}` : ''}</div>
        ${d.paid ? bar(d.paid / d.amount, 'var(--pos)', 'margin-top:6px') : ''}
        ${d.paid ? html`<details data-payments="${d.id}"><summary>Pagos</summary><div class="payments"></div></details>` : ''}
      </div>
      <div class="actions">
        <span class="num">${money(d.remaining)}</span>
        <button class="btn ghost sm" data-pay="${d.id}">Pago parcial</button>
        <button class="btn sm" data-settle="${d.id}">Saldar</button>
        <button class="icon-btn del" data-delete="${d.id}" title="Borrar" aria-label="Borrar">✕</button>
      </div>
    </div>`;

  const column = (dir: DebtDirection): Html => {
    const list = active.filter(d => d.direction === dir);
    if (!list.length) return empty(dir === 'owed_to_me' ? 'Nadie te debe nada.' : 'No le debes nada a nadie.');
    const byPerson = people.filter(p => list.some(d => personKey(d.person) === personKey(p)));
    return html`${byPerson.map(p => {
      const items = list.filter(d => personKey(d.person) === personKey(p));
      const mine = active.filter(d => personKey(d.person) === personKey(p));
      const both = mine.some(d => d.direction !== dir);
      const net = mine.reduce((s, d) => s + (d.direction === 'owed_to_me' ? d.remaining : -d.remaining), 0);
      return html`<div class="person">
        <div class="row" style="padding-top:0">
          ${avatar(p)}
          <div class="grow"><strong>${p}</strong>${both ? html`<div class="label">Neto con ${p}: <span class="${cls(net)}">${signed(net)}</span></div>` : ''}</div>
          <div class="num"><strong>${money(items.reduce((s, d) => s + d.remaining, 0))}</strong></div>
        </div>
        ${items.map(debtRow)}
      </div>`;
    })}`;
  };

  root.innerHTML = html`
    ${header('Deudas', 'Quién te debe y a quién le debes', html`<button class="btn" data-new>+ Nueva deuda</button>`)}
    <div class="grid g2">
      <section class="card"><div class="between"><h2>🙋 Me deben</h2><span class="num pos"><strong>${money(total('owed_to_me'))}</strong></span></div>${column('owed_to_me')}</section>
      <section class="card"><div class="between"><h2>🤝 Debo</h2><span class="num neg"><strong>${money(total('i_owe'))}</strong></span></div>${column('i_owe')}</section>
    </div>
    ${settled.length ? html`
      <details class="card" style="margin-top:16px"><summary style="margin:0">Saldadas (${settled.length})</summary>
        ${settled.map(d => html`
          <div class="row">
            <div class="grow">${d.person} · ${d.description || 'Sin descripción'}<div class="label">${d.direction === 'owed_to_me' ? 'Me debía' : 'Le debía'} · ${date(d.date)}</div></div>
            <span class="muted num">${money(d.amount)}</span><span class="badge">Saldada</span>
            <button class="icon-btn del" data-delete="${d.id}" title="Borrar" aria-label="Borrar">✕</button>
          </div>`)}
      </details>` : ''}`.value;

  const find = (id: string) => debts.find(d => d.id === id)!;

  root.querySelector('[data-new]')!.addEventListener('click', () => openDebt(null, people));

  root.querySelectorAll<HTMLDetailsElement>('[data-payments]').forEach(d => d.addEventListener('toggle', () => {
    if (d.open) loadPayments(find(d.dataset.payments!), d.querySelector('.payments')!, accName);
  }));

  root.addEventListener('click', async e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-edit],[data-pay],[data-settle],[data-delete]');
    if (!btn) return;
    const { edit, pay, settle, delete: del } = btn.dataset;
    if (edit) return openDebt(find(edit), people);
    if (pay) return openPayment(find(pay), accounts, false);
    if (settle) return openPayment(find(settle), accounts, true);
    if (del) {
      const d = find(del);
      const extra = d.paid ? ' También se borrarán sus pagos.' : '';
      if (!(await confirmDialog(`¿Borrar la deuda con ${d.person} (${d.description || 'sin descripción'})?${extra}`))) return;
      if (await run(() => api.deleteDebt(d.id), 'Deuda borrada')) await app.refresh();
    }
  });
}

async function loadPayments(debt: Debt, box: HTMLElement, accName: (id: string | null) => string | undefined) {
  box.innerHTML = '<p class="note">Cargando…</p>';
  try {
    const payments = await api.listDebtPayments(debt.id);
    box.innerHTML = html`${payments.map(p => html`
      <div class="row">
        <div class="grow muted num">${date(p.date)}${accName(p.accountId) ? ` · ${accName(p.accountId)}` : ''}</div>
        <span class="num">${money(p.amount)}</span>
        <button class="icon-btn del" data-del-payment="${p.id}" title="Borrar pago" aria-label="Borrar pago">✕</button>
      </div>`)}`.value;
  } catch (e) {
    box.innerHTML = html`<p class="error">${e instanceof Error ? e.message : 'No se pudieron cargar los pagos'}</p>`.value;
    return;
  }
  box.onclick = async e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-del-payment]');
    if (!btn) return;
    if (!(await confirmDialog('¿Borrar este pago? Si estaba asociado a una cuenta, se revierte el saldo.'))) return;
    if (await run(() => api.deleteDebtPayment(btn.dataset.delPayment!), 'Pago borrado')) await app.refresh();
  };
}

function openDebt(debt: Debt | null, people: string[]) {
  formDialog({
    title: debt ? 'Editar deuda' : 'Nueva deuda',
    body: html`
      <div class="form-grid">
        <label class="f">Tipo<select name="direction">
          <option value="owed_to_me" ${debt?.direction !== 'i_owe' ? 'selected' : ''}>Me debe</option>
          <option value="i_owe" ${debt?.direction === 'i_owe' ? 'selected' : ''}>Le debo</option>
        </select></label>
        <label class="f">Persona<input name="person" list="people" value="${debt?.person ?? ''}" required autocomplete="off"></label>
        <datalist id="people">${people.map(p => html`<option value="${p}">`)}</datalist>
        <label class="f">Importe<input name="amount" inputmode="decimal" value="${debt ? amountInput(debt.amount) : ''}" placeholder="0,00"></label>
        <label class="f">Fecha<input type="date" name="date" value="${debt?.date ?? today()}"></label>
        <label class="f full">Descripción<input name="description" value="${debt?.description ?? ''}" placeholder="Cena, préstamo…"></label>
      </div>`,
    async onSubmit(data) {
      const amount = parseAmount(String(data.get('amount') ?? ''));
      if (!(amount > 0)) throw new Error('El importe debe ser un número mayor que 0');
      const input = {
        direction: data.get('direction') as DebtDirection,
        person: String(data.get('person') ?? ''),
        amount,
        date: String(data.get('date')),
        description: String(data.get('description') ?? ''),
      };
      if (debt) await api.updateDebt(debt.id, input);
      else await api.createDebt(input);
      toast(debt ? 'Cambios guardados' : 'Deuda creada');
      await app.refresh();
    },
  });
}

function openPayment(debt: Debt, accounts: Account[], settle: boolean) {
  const verb = debt.direction === 'owed_to_me' ? 'Entra en' : 'Sale de';
  formDialog({
    title: settle ? `Saldar · ${debt.person}` : `Pago parcial · ${debt.person}`,
    submitLabel: settle ? 'Saldar' : 'Registrar pago',
    body: html`
      <p class="muted" style="margin:0">${debt.description || 'Sin descripción'} · pendiente <strong class="num">${money(debt.remaining)}</strong></p>
      <div class="form-grid">
        <label class="f">Importe<input name="amount" inputmode="decimal" value="${settle ? amountInput(debt.remaining) : ''}" placeholder="0,00" ${settle ? 'readonly' : 'autofocus'}></label>
        <label class="f">Fecha<input type="date" name="date" value="${today()}"></label>
        <label class="f full">${verb} la cuenta (opcional)<select name="account">${accountOptions(accounts, null, 'Ninguna (no mueve saldos)')}</select></label>
      </div>`,
    async onSubmit(data) {
      const amount = settle ? debt.remaining : parseAmount(String(data.get('amount') ?? ''));
      if (!(amount > 0)) throw new Error('El importe debe ser un número mayor que 0');
      await api.addDebtPayment(debt.id, { amount, date: String(data.get('date')), accountId: String(data.get('account') ?? '') || null });
      toast(settle || amount >= debt.remaining ? 'Deuda saldada' : 'Pago registrado');
      await app.refresh();
    },
  });
}
