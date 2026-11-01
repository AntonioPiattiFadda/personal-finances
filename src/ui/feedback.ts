// Avisos, confirmaciones y formularios en diálogo. Todo error de la API se muestra con su message.
import { html, type Html } from './html';

export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Error inesperado. Inténtalo de nuevo.';
}

let toastBox: HTMLElement | null = null;

export function toast(message: string, kind: 'ok' | 'error' = 'ok') {
  if (!toastBox) {
    toastBox = document.createElement('div');
    toastBox.className = 'toasts';
    toastBox.setAttribute('role', 'status');
    document.body.append(toastBox);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  toastBox.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 2500);
}

/** Ejecuta una acción y muestra el error si falla. Devuelve true si salió bien. */
export async function run(fn: () => Promise<unknown>, okMessage?: string): Promise<boolean> {
  try {
    await fn();
    if (okMessage) toast(okMessage);
    return true;
  } catch (e) {
    toast(errorMessage(e), 'error');
    return false;
  }
}

function openDialog(content: Html): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = content.value;
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.showModal();
  return dialog;
}

export function confirmDialog(message: string, okLabel = 'Borrar'): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = openDialog(html`
      <form method="dialog" class="stack">
        <p style="margin:0">${message}</p>
        <div class="actions" style="justify-content:flex-end">
          <button class="btn ghost" value="cancel">Cancelar</button>
          <button class="btn danger" value="ok" autofocus>${okLabel}</button>
        </div>
      </form>`);
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'));
  });
}

interface FormDialog {
  title: string;
  body: Html;
  submitLabel?: string;
  /** Si lanza, el error se muestra dentro del diálogo y este sigue abierto. */
  onSubmit: (data: FormData, form: HTMLFormElement) => Promise<void>;
  onOpen?: (form: HTMLFormElement) => void;
}

export function formDialog(opts: FormDialog): void {
  const dialog = openDialog(html`
    <form class="stack" novalidate>
      <div class="between"><h2 style="margin:0">${opts.title}</h2><button type="button" class="icon-btn" data-close title="Cerrar">✕</button></div>
      ${opts.body}
      <p class="error" role="alert"></p>
      <div class="actions" style="justify-content:flex-end">
        <button type="button" class="btn ghost" data-close>Cancelar</button>
        <button class="btn">${opts.submitLabel ?? 'Guardar'}</button>
      </div>
    </form>`);
  const form = dialog.querySelector('form')!;
  const error = form.querySelector<HTMLElement>('.error')!;
  form.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dialog.close()));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const submit = form.querySelector<HTMLButtonElement>('button:not([type])')!;
    submit.disabled = true;
    error.textContent = '';
    try {
      await opts.onSubmit(new FormData(form), form);
      dialog.close();
    } catch (err) {
      error.textContent = errorMessage(err);
    } finally {
      submit.disabled = false;
    }
  });
  opts.onOpen?.(form);
}
