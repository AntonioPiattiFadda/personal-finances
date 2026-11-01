import { api } from '../api';
import type { Tag } from '../api/types';
import { chip, empty, randomTagColor, TAG_NOTE } from '../ui/components';
import { money } from '../ui/format';
import { confirmDialog, formDialog, run, toast } from '../ui/feedback';
import { html } from '../ui/html';
import { app } from '../ui/state';

export async function etiquetas(root: HTMLElement) {
  const [tags, usageRows] = await Promise.all([api.listTags(), api.listTagUsage()]);
  const usage = (id: string) => {
    const u = usageRows.find(r => r.tagId === id);
    return { count: u?.expenseCount ?? 0, total: u?.expenseTotal ?? 0, fixed: u?.recurringCount ?? 0 };
  };

  root.innerHTML = html`
    <h1>Etiquetas</h1><p class="sub">Organiza tus gastos como quieras</p>
    <div class="stack">
      <form class="card actions" id="new-tag" novalidate>
        <input name="name" placeholder="Nombre de la etiqueta" aria-label="Nombre de la etiqueta" style="flex:1;min-width:180px">
        <input type="color" name="color" value="${randomTagColor()}" aria-label="Color" style="width:48px;padding:4px;height:40px">
        <button class="btn">Crear etiqueta</button>
      </form>
      <section class="card">
        ${tags.length ? html`<div class="table-wrap"><table>
          <thead><tr><th>Etiqueta</th><th>Color</th><th class="r">Gastos</th><th class="r hide-sm">Fijos</th><th class="r">Total gastado</th><th></th></tr></thead>
          <tbody>${tags.map(t => {
            const u = usage(t.id);
            return html`<tr>
              <td><button type="button" class="link" data-rename="${t.id}" title="Renombrar">${chip(t.name, t.color)}</button></td>
              <td><input type="color" value="${t.color}" data-color="${t.id}" aria-label="Color de ${t.name}"></td>
              <td class="r num">${u.count}</td>
              <td class="r num hide-sm">${u.fixed}</td>
              <td class="r num">${money(u.total)}</td>
              <td><button class="icon-btn del" data-delete="${t.id}" title="Borrar" aria-label="Borrar">✕</button></td>
            </tr>`;
          })}</tbody>
        </table></div>
        <p class="note">Toca una etiqueta para renombrarla. ${TAG_NOTE}</p>` : empty('Todavía no hay etiquetas.')}
      </section>
    </div>`.value;

  const find = (id: string) => tags.find(t => t.id === id)!;

  const form = root.querySelector<HTMLFormElement>('#new-tag')!;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') ?? '');
    if (await run(() => api.createTag(name, String(data.get('color'))), 'Etiqueta creada')) await app.refresh();
  });

  root.querySelectorAll<HTMLInputElement>('[data-color]').forEach(input => input.addEventListener('change', async () => {
    if (!(await run(() => api.updateTag(input.dataset.color!, { color: input.value })))) input.value = find(input.dataset.color!).color;
    else await app.refresh();
  }));

  root.addEventListener('click', async e => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-rename],[data-delete]');
    if (!btn) return;
    if (btn.dataset.rename) return openRename(find(btn.dataset.rename));
    const t = find(btn.dataset.delete!);
    const u = usage(t.id);
    const msg = u.count || u.fixed
      ? `¿Borrar «${t.name}»? Se quitará de ${u.count} gastos y ${u.fixed} fijos (los gastos no se borran).`
      : `¿Borrar «${t.name}»?`;
    if (!(await confirmDialog(msg))) return;
    if (await run(() => api.deleteTag(t.id), 'Etiqueta borrada')) await app.refresh();
  });
}

function openRename(tag: Tag) {
  formDialog({
    title: 'Renombrar etiqueta',
    body: html`<label class="f">Nombre<input name="name" value="${tag.name}" required autofocus></label>`,
    async onSubmit(data) {
      await api.updateTag(tag.id, { name: String(data.get('name') ?? '') });
      toast('Etiqueta renombrada');
      await app.refresh();
    },
  });
}
