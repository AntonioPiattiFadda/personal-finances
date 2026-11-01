import { answerOAuthRequest, getOAuthRequest } from '../api';
import { errorMessage } from '../ui/feedback';
import { html, type Html } from '../ui/html';

export const OAUTH_CONSENT_PATH = '/oauth/consent';

/** Pantalla a la que Supabase Auth manda al conectar Claude (MCP). Necesita sesión. */
export async function renderOAuthConsent(root: HTMLElement) {
  const authorizationId = new URLSearchParams(location.search).get('authorization_id');
  const shell = (body: Html) => {
    root.innerHTML = html`
      <div class="login">
        <section class="card stack">
          <div class="brand"><i></i>Finanzas personales</div>
          ${body}
        </section>
      </div>`.value;
  };

  if (!authorizationId) {
    shell(html`<p class="error">Falta la solicitud de acceso. Vuelve a conectar desde Claude.</p>`);
    return;
  }
  shell(html`<p class="muted">Cargando solicitud…</p>`);

  let req;
  try {
    req = await getOAuthRequest(authorizationId);
  } catch (e) {
    shell(html`<p class="error">${errorMessage(e)}</p>`);
    return;
  }
  if (req.redirectUrl) {
    location.replace(req.redirectUrl);
    return;
  }

  const trusted = req.trustedClient;
  shell(html`
    <h2>Conectar ${trusted ?? req.clientName}</h2>
    <p class="muted">Cuenta: ${req.email}</p>
    ${trusted
      ? html`<p><strong>${trusted}</strong> podrá <strong>ver y modificar</strong> todos tus datos: cuentas, gastos, fijos, inversiones y deudas.</p>`
      : html`<p class="error">Esta aplicación («${req.clientName}») no es un cliente conocido. Por seguridad solo puedes cancelar.</p>`}
    ${trusted === 'Claude Code' ? html`<p class="note">Vuelve a un programa de este ordenador. Aprueba solo si acabas de conectar Claude Code.</p>` : ''}
    <div class="actions" style="justify-content:center">
      ${trusted ? html`<button class="btn" data-answer="yes">Permitir</button>` : ''}
      <button class="btn ghost" data-answer="no">Cancelar</button>
    </div>
    <p class="error" role="alert"></p>`);

  const error = root.querySelector<HTMLElement>('[role="alert"]')!;
  root.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach(button => {
    button.addEventListener('click', async () => {
      root.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach(b => { b.disabled = true; });
      error.textContent = '';
      try {
        location.replace(await answerOAuthRequest(authorizationId, button.dataset.answer === 'yes'));
      } catch (e) {
        error.textContent = errorMessage(e);
        root.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach(b => { b.disabled = false; });
      }
    });
  });
}
