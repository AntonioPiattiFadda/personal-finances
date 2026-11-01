// Plantillas HTML con escapado automático: todo lo interpolado se escapa salvo que sea Html.

export class Html {
  readonly value: string;
  constructor(value: string) { this.value = value; }
  toString() { return this.value; }
}

type Part = Html | string | number | boolean | null | undefined | Part[];

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function render(p: Part): string {
  if (p == null || p === false) return '';
  if (p instanceof Html) return p.value;
  if (Array.isArray(p)) return p.map(render).join('');
  return esc(String(p));
}

export function html(strings: TemplateStringsArray, ...values: Part[]): Html {
  let out = strings[0];
  values.forEach((v, i) => { out += render(v) + strings[i + 1]; });
  return new Html(out);
}

/** HTML de confianza (generado por el propio código, nunca con datos del usuario). */
export const raw = (s: string) => new Html(s);
