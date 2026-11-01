import { api } from '../api';
import type { Account, Investment } from '../api/types';
import { accountOptions, empty, header } from '../ui/components';
import { ACCOUNT_TYPES, cls, date, money, parseAmount, pct, signed, today } from '../ui/format';
import { confirmDialog, formDialog, run, toast } from '../ui/feedback';
import { html } from '../ui/html';
import { app } from '../ui/state';

// Historiales abiertos: se mantienen al refrescar.
const openHistory = new Set<string>();

export async function inversiones(root: HTMLElement) {
  const [all, accounts, allAccounts, net] = await Promise.all([
    api.listInvestments({ includeArchived: true }), api.listAccounts(), api.listAccounts({ includeArchived: true }),
    api.getNetWorth(),
  ]);
  const list = all.filter(i => !i.archived);
  const archived = all.filter(i => i.archived);
  const { investmentsInvested: invested, investmentsTotal: value, investmentsGain: gain } = net;
  const ret = invested > 0 ? gain / invested : null;
  const where = (i: Investment) => {
    const a = allAccounts.find(x => x.id === i.accountId);
    return a ? `${ACCOUNT_TYPES[a.type][1]} ${a.name}` : 'Sin ubicación';
  };

  root.innerHTML = html`
    ${header('Inversiones', 'Actualiza el valor cada tanto y mira cuánto rinde', html`<button class="btn" data-new>+ Nueva inversión</button>`)}
    <div class="stack">
      <div class="grid g4">
        <div class="card stat"><div class="label">Aportado</div><div class="v">${money(invested)}</div></div>
        <div class="card stat"><div class="label">Valor actual</div><div class="v">${money(value)}</div></div>
        <div class="card stat"><div class="label">Ganancia</div><div class="v ${cls(gain)}">${signed(gain)}</div></div>
        <div class="card stat"><div class="label">Rentabilidad</div><div class="v ${cls(ret)}">${pct(ret)}</div></div>
      </div>
      ${list.length ? html`<div class="grid g2">${list.map(i => html`
        <article class="card" data-investment="${i.id}">
          <div class="between">
            <div style="min-width:0">
              <h2 style="margin:0">${i.name}</h2>
              <div class="label">${where(i)}${i.lastValuationDate ? ` · actualizado ${date(i.lastValuationDate)}` : ''}</div>
            </div>
            <div class="num ${cls(i.returnPct)}" style="font-size:20px;font-weight:700">${pct(i.returnPct)}</div>
          </div>
          <div class="grid g3" style="margin-top:14px">
            <div class="stat"><div class="label">Aportado</div><div class="num">${money(i.invested)}</div></div>
            <div class="stat"><div class="label">Valor actual</div><div class="num"><strong>${money(i.currentValue)}</strong></div></div>
            <div class="stat"><div class="label">Ganancia</div><div class="num ${cls(i.gain)}">${signed(i.gain)}</div></div>
          </div>
          <div class="label" style="margin-top:8px">Anualizada aprox.: <span class="${cls(i.annualizedPct)}">${pct(i.annualizedPct)}</span></div>
          <form class="actions" style="margin-top:14px" data-valuation="${i.id}" novalidate>
            <input name="value" placeholder="Nuevo valor" inputmode="decimal" aria-label="Nuevo valor de ${i.name}" style="width:130px">
            <button class="btn sm">Actualizar valor</button>
            <button type="button" class="btn ghost sm" data-contribute="${i.id}">Aportar / retirar</button>
            <span style="flex:1"></span>
            <button type="button" class="icon-btn" data-edit="${i.id}" title="Editar" aria-label="Editar">✎</button>
            <button type="button" class="icon-btn" data-archive="${i.id}" title="Archivar" aria-label="Archivar">🗄</button>
          </form>
          <details data-history="${i.id}" ${openHistory.has(i.id) ? 'open' : ''}><summary>Historial</summary><div class="history"></div></details>
        </article>`)}</div>` : html`<section class="card">${empty('Todavía no tienes inversiones. Crea la primera con «+ Nueva inversión».')}</section>`}
      ${archived.length ? html`
        <details class="card"><summary style="margin:0">Archivadas (${archived.length})</summary>
          ${archived.map(i => html`
            <div class="row">
              <div class="grow"><strong>${i.name}</strong><div class="label">Aportado ${money(i.invested)} · último valor ${money(i.currentValue)} · <span class="${cls(i.gain)}">${signed(i.gain)}</span></div></div>
              <button class="btn ghost sm" data-unarchive="${i.id}">Restaurar</button>
              <button class="icon-btn del" data-delete="${i.id}" title="Borrar" aria-label="Borrar">✕</button>
            </div>`)}
        </details>` : ''}
    </div>`.value;

  const find = (id: string) => all.find(i => i.id === id)!;

  root.querySelector('[data-new]')!.addEventListener('click', () => openNew(accounts));

  root.querySelectorAll<HTMLFormElement>('[data-valuation]').forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = parseAmount(String(new FormData(form).get('value') ?? ''));
    if (Number.isNaN(v) || v < 0) return toast('Escribe el valor actual (un número mayor o igual que 0)', 'error');
    if (await run(() => api.addValuation(form.dataset.valuation!, { date: today(), value: v }), 'Valor actualizado')) await app.refresh();
  }));

  root.querySelectorAll<HTMLDetailsElement>('[data-history]').forEach(d => {
    const load = () => loadHistory(d.dataset.history!, d.querySelector('.history')!);
    d.addEventListener('toggle', () => {
      if (d.open) { openHistory.add(d.dataset.history!); load(); } else openHistory.delete(d.dataset.history!);
    });
    if (d.open) load();
  });

  root.addEventListener('click', async e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-contribute],[data-edit],[data-archive],[data-unarchive],[data-delete]');
    if (!btn) return;
    const { contribute, edit, archive, unarchive, delete: del } = btn.dataset;
    if (contribute) return openContribution(find(contribute));
    if (edit) return openEdit(find(edit), accounts);
    if (archive) {
      const i = find(archive);
      if (!(await confirmDialog(`¿Archivar «${i.name}»? Dejará de sumar al patrimonio.`, 'Archivar'))) return;
      if (await run(() => api.updateInvestment(i.id, { archived: true }), 'Inversión archivada')) await app.refresh();
    }
    if (unarchive && await run(() => api.updateInvestment(unarchive, { archived: false }), 'Inversión restaurada')) await app.refresh();
    if (del) {
      const i = find(del);
      if (!(await confirmDialog(`¿Borrar «${i.name}» con todo su historial de aportes y valoraciones?`))) return;
      if (await run(() => api.deleteInvestment(i.id), 'Inversión borrada')) await app.refresh();
    }
  });
}

async function loadHistory(investmentId: string, box: HTMLElement) {
  box.innerHTML = '<p class="note">Cargando…</p>';
  try {
    const [contributions, valuations] = await Promise.all([api.listContributions(investmentId), api.listValuations(investmentId)]);
    const rows = [
      ...contributions.map(c => ({ kind: 'c' as const, id: c.id, date: c.date, amount: c.amount,
        label: c.amount < 0 ? 'Retirada' : 'Aporte', note: c.note })),
      ...valuations.map(v => ({ kind: 'v' as const, id: v.id, date: v.date, amount: v.value, label: 'Valoración', note: '' })),
    ].sort((a, b) => b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === 'v' ? -1 : 1));
    box.innerHTML = rows.length ? html`<div class="table-wrap"><table style="margin-top:6px">${rows.map(r => html`
      <tr>
        <td class="muted num">${date(r.date)}</td>
        <td>${r.label}${r.note ? html` <span class="muted">· ${r.note}</span>` : ''}</td>
        <td class="r num ${r.kind === 'c' ? cls(r.amount) : ''}">${r.kind === 'c' ? signed(r.amount) : money(r.amount)}</td>
        <td><button class="icon-btn del" data-del-${r.kind === 'c' ? 'contribution' : 'valuation'}="${r.id}" title="Borrar" aria-label="Borrar">✕</button></td>
      </tr>`)}</table></div>`.value : html`<p class="note">Sin movimientos.</p>`.value;
  } catch (e) {
    box.innerHTML = html`<p class="error">${e instanceof Error ? e.message : 'No se pudo cargar el historial'}</p>`.value;
    return;
  }
  box.onclick = async e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-del-contribution],[data-del-valuation]');
    if (!btn) return;
    const isContribution = 'delContribution' in btn.dataset;
    const msg = isContribution
      ? '¿Borrar este aporte? La valoración que se creó con él no se borra: revisa el valor actual después.'
      : '¿Borrar esta valoración?';
    if (!(await confirmDialog(msg))) return;
    const ok = await run(
      () => isContribution ? api.deleteContribution(btn.dataset.delContribution!) : api.deleteValuation(btn.dataset.delValuation!),
      'Borrado',
    );
    if (ok) await app.refresh();
  };
}

function openNew(accounts: Account[]) {
  formDialog({
    title: 'Nueva inversión',
    submitLabel: 'Crear',
    body: html`
      <div class="form-grid">
        <label class="f full">Nombre<input name="name" placeholder="MSCI World ETF, Bitcoin…" required autofocus></label>
        <label class="f">Importe inicial<input name="amount" inputmode="decimal" placeholder="0,00"></label>
        <label class="f">Fecha<input type="date" name="date" value="${today()}"></label>
        <label class="f full">Dónde está<select name="account">${accountOptions(accounts, null, 'Sin ubicación')}</select></label>
      </div>
      <p class="note">Se registra como primer aporte y como primera valoración.</p>`,
    async onSubmit(data) {
      const amount = parseAmount(String(data.get('amount') ?? ''));
      if (!(amount > 0)) throw new Error('El importe inicial debe ser un número mayor que 0');
      await api.createInvestment({
        name: String(data.get('name') ?? ''), amount, date: String(data.get('date')),
        accountId: String(data.get('account') ?? '') || null,
      });
      toast('Inversión creada');
      await app.refresh();
    },
  });
}

function openContribution(i: Investment) {
  formDialog({
    title: `Aportar / retirar · ${i.name}`,
    body: html`
      <div class="form-grid">
        <label class="f">Movimiento<select name="dir"><option value="in">Aporte (meto dinero)</option><option value="out">Retirada (saco dinero)</option></select></label>
        <label class="f">Importe<input name="amount" inputmode="decimal" placeholder="0,00" autofocus></label>
        <label class="f">Fecha<input type="date" name="date" value="${today()}"></label>
        <label class="f">Nota (opcional)<input name="note"></label>
      </div>
      <p class="note">El valor de la inversión se ajusta solo con el aporte, para que meter dinero no cuente como ganancia.</p>`,
    async onSubmit(data) {
      const amount = parseAmount(String(data.get('amount') ?? ''));
      if (!(amount > 0)) throw new Error('El importe debe ser un número mayor que 0');
      const signedAmount = data.get('dir') === 'out' ? -amount : amount;
      await api.addContribution(i.id, { date: String(data.get('date')), amount: signedAmount, note: String(data.get('note') ?? '') });
      toast(signedAmount > 0 ? 'Aporte registrado' : 'Retirada registrada');
      await app.refresh();
    },
  });
}

function openEdit(i: Investment, accounts: Account[]) {
  formDialog({
    title: 'Editar inversión',
    body: html`
      <div class="form-grid">
        <label class="f full">Nombre<input name="name" value="${i.name}" required></label>
        <label class="f full">Dónde está<select name="account">${accountOptions(accounts, i.accountId, 'Sin ubicación')}</select></label>
      </div>`,
    async onSubmit(data) {
      await api.updateInvestment(i.id, { name: String(data.get('name') ?? ''), accountId: String(data.get('account') ?? '') || null });
      toast('Cambios guardados');
      await app.refresh();
    },
  });
}
