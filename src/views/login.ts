import { auth, usingMockAuth } from '../api';
import { errorMessage } from '../ui/feedback';
import { html } from '../ui/html';

export function renderLogin(root: HTMLElement) {
  root.innerHTML = html`
    <div class="login">
      <form class="card stack" novalidate>
        <div class="brand"><i></i>Finanzas personales</div>
        <p class="muted">Te enviamos un enlace mágico a tu correo para entrar. Si es tu primera vez, la cuenta se crea al abrirlo.</p>
        <input type="email" name="email" placeholder="tu@correo.com" autocomplete="email" required autofocus aria-label="Email">
        <button class="btn" style="width:100%">Enviar enlace</button>
        <p class="error" role="alert"></p>
        <p class="ok-msg" hidden></p>
        ${usingMockAuth ? html`<p class="note">Modo demo: entrarás al momento sin recibir ningún correo.</p>` : ''}
      </form>
    </div>`.value;
  const form = root.querySelector('form')!;
  const error = form.querySelector<HTMLElement>('.error')!;
  const ok = form.querySelector<HTMLElement>('.ok-msg')!;
  error.textContent = auth.takeCallbackError() ?? '';
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = String(new FormData(form).get('email') ?? '');
    const button = form.querySelector('button')!;
    button.disabled = true;
    error.textContent = '';
    ok.hidden = true;
    try {
      await auth.signIn(email);
      ok.textContent = `Listo. Revisa tu correo (${email.trim()}) y abre el enlace en este mismo navegador.`;
      ok.hidden = false;
    } catch (err) {
      error.textContent = errorMessage(err);
    } finally {
      button.disabled = false;
    }
  });
}
