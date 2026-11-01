import { api, auth } from '../api';
import { setCurrency } from '../ui/format';
import { run } from '../ui/feedback';
import { html } from '../ui/html';
import { app } from '../ui/state';

const CURRENCIES: [string, string][] = [
  ['EUR', 'Euro'], ['USD', 'Dólar estadounidense'], ['GBP', 'Libra esterlina'], ['CHF', 'Franco suizo'],
  ['ARS', 'Peso argentino'], ['MXN', 'Peso mexicano'], ['CLP', 'Peso chileno'], ['COP', 'Peso colombiano'],
  ['UYU', 'Peso uruguayo'], ['PEN', 'Sol peruano'], ['BRL', 'Real brasileño'],
];

export async function ajustes(root: HTMLElement) {
  const currency = await api.getCurrency();
  const options = CURRENCIES.some(c => c[0] === currency) ? CURRENCIES : [[currency, currency] as [string, string], ...CURRENCIES];

  root.innerHTML = html`
    <h1>Ajustes</h1><p class="sub">Tu cuenta y preferencias</p>
    <section class="card stack" style="max-width:520px">
      <label class="f">Moneda
        <select id="currency">${options.map(([code, name]) => html`<option value="${code}" ${code === currency ? 'selected' : ''}>${code} · ${name}</option>`)}</select>
      </label>
      <p class="note" style="margin:0">Solo cambia cómo se muestran los importes: no convierte nada.</p>
      <div class="row"><div class="grow"><strong>Sesión</strong><div class="label">${app.email}</div></div><button class="btn ghost" id="logout">Cerrar sesión</button></div>
    </section>`.value;

  const select = root.querySelector<HTMLSelectElement>('#currency')!;
  select.addEventListener('change', async () => {
    if (await run(() => api.setCurrency(select.value), 'Moneda guardada')) setCurrency(select.value);
    else select.value = currency;
  });
  root.querySelector('#logout')!.addEventListener('click', () => run(() => auth.signOut()));
}
