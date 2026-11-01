// Piezas de HTML reutilizadas en varias pantallas.
import type { Account, Tag, TagTotal } from '../api/types';
import { ACCOUNT_TYPES, money, NO_TAG_COLOR } from './format';
import { html, type Html } from './html';

export const chip = (name: string, color: string | null) =>
  html`<span class="chip" style="--c:${color ?? NO_TAG_COLOR}">${name}</span>`;

export function tagChips(tagIds: string[], tags: Tag[], emptyLabel = true): Html {
  const list = tagIds.map(id => tags.find(t => t.id === id)).filter((t): t is Tag => !!t);
  if (!list.length) return emptyLabel ? chip('Sin etiqueta', null) : html``;
  return html`${list.map(t => chip(t.name, t.color))}`;
}

export const bar = (fraction: number, color: string, style = '') =>
  html`<div class="bar" style="${style}"><i style="width:${Math.max(0, Math.min(1, fraction)) * 100}%;background:${color}"></i></div>`;

export const TAG_NOTE = 'Un gasto con varias etiquetas suma en cada una, así que el total por etiquetas puede superar el total gastado.';

export function tagBars(rows: TagTotal[]): Html {
  if (!rows.length) return html`<p class="empty">No hay gastos en este periodo.</p>`;
  const max = rows[0].total || 1;
  return html`
    ${rows.map(r => html`
      <div class="row">
        <div class="tag-col">${chip(r.tagName, r.tagColor)}</div>
        <div class="grow">${bar(r.total / max, r.tagColor ?? NO_TAG_COLOR)}</div>
        <div class="num amount-col">${money(r.total)}</div>
      </div>`)}
    <p class="note">${TAG_NOTE}</p>`;
}

/** Opciones de un <select> de cuentas (solo no archivadas). */
export function accountOptions(accounts: Account[], selected: string | null, emptyLabel: string | null = 'Sin cuenta'): Html {
  return html`
    ${emptyLabel !== null ? html`<option value="" ${selected ? '' : 'selected'}>${emptyLabel}</option>` : ''}
    ${accounts.map(a => html`<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${ACCOUNT_TYPES[a.type][1]} ${a.name}</option>`)}`;
}

export const empty = (text: string) => html`<p class="empty">${text}</p>`;

/** Selector de etiquetas como chips que se activan y desactivan. */
export function tagPicker(tags: Tag[], selected: string[], allowCreate = true): Html {
  return html`
    <div class="chips" data-tag-picker>
      ${tags.map(t => html`<button type="button" class="chip ${selected.includes(t.id) ? 'on' : ''}" style="--c:${t.color}" data-tag="${t.id}" aria-pressed="${selected.includes(t.id)}">${t.name}</button>`)}
      ${allowCreate ? html`<input class="new-tag" placeholder="+ nueva etiqueta" aria-label="Nueva etiqueta" data-new-tag>` : ''}
    </div>`;
}

export const pickedTags = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLElement>('[data-tag-picker] .chip.on')].map(b => b.dataset.tag!);

const PALETTE = ['#2f9e44', '#e8590c', '#1c7ed6', '#ae3ec9', '#f08c00', '#0ca678', '#e64980', '#4263eb', '#7048e8', '#c92a2a'];
export const randomTagColor = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];

/**
 * Activa un selector de etiquetas: clic alterna, Enter en el input crea la etiqueta al vuelo.
 * `create` hace la llamada a la API y devuelve la etiqueta creada.
 */
export function bindTagPicker(root: ParentNode, create: (name: string) => Promise<Tag | null>) {
  const picker = root.querySelector<HTMLElement>('[data-tag-picker]');
  if (!picker) return;
  picker.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.chip');
    if (!b) return;
    b.classList.toggle('on');
    b.setAttribute('aria-pressed', String(b.classList.contains('on')));
  });
  const input = picker.querySelector<HTMLInputElement>('[data-new-tag]');
  input?.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    const existing = [...picker.querySelectorAll<HTMLButtonElement>('button.chip')].find(b => b.textContent!.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.classList.add('on');
      input.value = '';
      return;
    }
    const tag = await create(name);
    if (!tag) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = html`<button type="button" class="chip on" style="--c:${tag.color}" data-tag="${tag.id}" aria-pressed="true">${tag.name}</button>`.value;
    input.before(tmp.firstElementChild!);
    input.value = '';
  });
}

const AVATAR_COLORS = ['#4f46e5', '#e8590c', '#0ca678', '#e64980', '#1c7ed6', '#f08c00'];
/** Color fijo por persona (derivado del nombre). */
export function avatar(person: string): Html {
  let h = 0;
  for (const c of person.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return html`<div class="avatar" style="background:${AVATAR_COLORS[h % AVATAR_COLORS.length]}">${[...person.trim()][0]?.toUpperCase() ?? '?'}</div>`;
}

/** Cabecera de pantalla con título, subtítulo y acción opcional. */
export const header = (title: string, sub: string, action?: Html) => action
  ? html`<div class="between"><div><h1>${title}</h1><p class="sub">${sub}</p></div>${action}</div>`
  : html`<h1>${title}</h1><p class="sub">${sub}</p>`;
