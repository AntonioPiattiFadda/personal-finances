import { api } from '../api';
import type { RecurringItem } from '../api/types';
import { bar, empty, tagBars } from '../ui/components';
import { ACCOUNT_TYPES, cls, money, monthLabel, signed, thisMonth } from '../ui/format';
import { html } from '../ui/html';

/** Fijos activos y vigentes en el mes (YYYY-MM). */
export function activeInMonth(r: RecurringItem, month: string) {
  const first = `${month}-01`;
  const last = `${month}-31`;
  return r.active && (!r.startDate || r.startDate <= last) && (!r.endDate || r.endDate >= first);
}

export async function resumen(root: HTMLElement) {
  const month = thisMonth();
  const [net, locations, recurring, expenses, byTag, investments] = await Promise.all([
    api.getNetWorth(), api.getMoneyByLocation(), api.listRecurring(),
    api.listExpenses({ month }), api.expensesByTag(month), api.listInvestments(),
  ]);

  const current = recurring.filter(r => activeInMonth(r, month));
  const fixedIn = current.filter(r => r.kind === 'income').reduce((s, r) => s + r.monthlyAmount, 0);
  const fixedOut = current.filter(r => r.kind === 'expense').reduce((s, r) => s + r.monthlyAmount, 0);
  const variable = expenses.reduce((s, e) => s + e.amount, 0);
  const available = fixedIn - fixedOut;
  const left = available - variable;
  const invGain = investments.reduce((s, i) => s + i.gain, 0);
  const maxLoc = Math.max(...locations.map(l => l.total), 0) || 1;

  root.innerHTML = html`
    <h1>Resumen</h1><p class="sub">${monthLabel(month)}</p>
    <div class="stack">
      <section class="card hero">
        <div class="label">Patrimonio neto</div>
        <div class="big">${money(net.netWorth)}</div>
        <div class="grid g4" style="margin-top:16px">
          <div class="stat"><div class="label">En cuentas</div><div class="v">${money(net.accountsTotal)}</div></div>
          <div class="stat"><div class="label">Inversiones</div><div class="v">${money(net.investmentsTotal)}</div>
            ${investments.length ? html`<div class="label">${signed(invGain)} de ganancia</div>` : ''}</div>
          <div class="stat"><div class="label">Me deben</div><div class="v">${money(net.owedToMe)}</div></div>
          <div class="stat"><div class="label">Debo</div><div class="v">${net.iOwe ? '−' : ''}${money(net.iOwe)}</div></div>
        </div>
      </section>
      <div class="grid g2">
        <section class="card">
          <h2>Dónde está la plata</h2>
          ${locations.length ? locations.map(l => html`
            <div class="row">
              <div class="ico-box">${l.type ? ACCOUNT_TYPES[l.type][1] : '📍'}</div>
              <div class="grow">
                <div class="between"><strong>${l.name}</strong><span class="num">${money(l.total)}</span></div>
                ${bar(l.total / maxLoc, 'var(--accent)', 'margin-top:6px')}
                ${l.investments ? html`<div class="label" style="margin-top:4px">${money(l.cash)} en cuenta · ${money(l.investments)} invertido</div>` : ''}
              </div>
            </div>`) : empty('Todavía no hay cuentas. Créalas en «Cuentas».')}
        </section>
        <section class="card">
          <h2>Este mes</h2>
          <div class="row"><div class="grow">Ingresos fijos</div><div class="num pos">+${money(fixedIn)}</div></div>
          <div class="row"><div class="grow">Gastos fijos <span class="muted">(equivalente mensual)</span></div><div class="num neg">−${money(fixedOut)}</div></div>
          <div class="row"><div class="grow">Gastos variables</div><div class="num neg">−${money(variable)}</div></div>
          <div class="row"><div class="grow"><strong>Queda</strong></div><div class="num ${cls(left)}"><strong>${signed(left)}</strong></div></div>
          ${available > 0 ? html`
            <div style="margin-top:14px">
              <div class="between label"><span>Gastado del disponible para variables</span><span>${Math.round(variable / available * 100)} %</span></div>
              ${bar(variable / available, variable > available ? 'var(--neg)' : 'var(--pos)', 'margin-top:6px;height:10px')}
            </div>` : ''}
        </section>
      </div>
      <section class="card"><h2>Gastos variables por etiqueta</h2>${tagBars(byTag)}</section>
    </div>`.value;
}
