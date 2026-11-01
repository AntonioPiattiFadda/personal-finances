// Autenticación por magic link. El frontend solo ve estos tipos y funciones.
import { supabase } from './client';
import { ApiError } from './types';

export interface Session { userId: string; email: string }

function toSession(s: { user: { id: string; email?: string } } | null): Session | null {
  return s ? { userId: s.user.id, email: s.user.email ?? '' } : null;
}

let callbackChecked = false;
let callbackError: string | null = null;

/**
 * Si se volvió de un enlace que falló (caducado, ya usado, abierto en otro navegador),
 * Supabase deja `code` o `error*` en la URL. Se guarda el motivo y se limpia la URL
 * para que al recargar no se reintente.
 */
function checkCallbackUrl(hasSession: boolean): void {
  if (callbackChecked) return;
  callbackChecked = true;
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const get = (k: string) => url.searchParams.get(k) ?? hash.get(k);
  const errorCode = get('error_code');
  const failed = Boolean(get('error') || errorCode || get('error_description'));
  const leftoverCode = url.searchParams.has('code');
  if (!failed && !leftoverCode) return;

  if (!hasSession) {
    callbackError = errorCode === 'otp_expired'
      ? 'El enlace ha caducado o ya se usó. Pide uno nuevo.'
      : failed
        ? 'No se pudo completar el acceso. Pide un enlace nuevo.'
        : 'No se pudo completar el acceso. Abre el enlace en el mismo navegador donde lo pediste.';
  }
  for (const k of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(k);
  if (hash.has('error') || hash.has('error_code')) url.hash = '';
  window.history.replaceState(window.history.state, '', url.toString());
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  checkCallbackUrl(Boolean(data.session));
  if (error) throw new ApiError('No se pudo recuperar la sesión', error.code);
  return toSession(data.session);
}

/** Motivo por el que falló el último enlace de acceso (una sola vez), o null. */
export function takeCallbackError(): string | null {
  const e = callbackError;
  callbackError = null;
  return e;
}

/** Envía el enlace de acceso. Si el email no existe, crea el usuario. */
export async function signIn(email: string): Promise<void> {
  const clean = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new ApiError('El email no es válido');
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    // Con el query: la pantalla de consentimiento OAuth (/oauth/consent?authorization_id=…)
    // tiene que volver al mismo pedido después del login.
    options: { emailRedirectTo: window.location.origin + window.location.pathname + window.location.search },
  });
  if (error) {
    if (error.status === 429) throw new ApiError('Demasiados intentos. Espera un momento y vuelve a probar.', error.code);
    throw new ApiError('No se pudo enviar el enlace de acceso', error.code);
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new ApiError('No se pudo cerrar la sesión', error.code);
}

/** Avisa en cada cambio de sesión (login, logout, refresco). Devuelve la función para desuscribirse. */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(toSession(session)));
  return () => data.subscription.unsubscribe();
}
