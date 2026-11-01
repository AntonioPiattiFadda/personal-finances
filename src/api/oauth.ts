// Consentimiento OAuth para el servidor MCP (api/mcp.ts). Supabase Auth hace de servidor OAuth 2.1:
// Claude se registra solo y manda al usuario a /oauth/consent?authorization_id=…; al aprobar,
// Claude recibe un access token de este usuario y con él lee y escribe como si fuera la web.
import { supabase } from './client';
import { ApiError } from './types';

/**
 * El registro dinámico de clientes está abierto: cualquiera puede registrar una app con el
 * nombre que quiera y mandar el enlace. El nombre no prueba nada; a dónde vuelve el código sí.
 * Por eso solo se puede aprobar si vuelve a un cliente conocido:
 * - Claude (web, Desktop, mobile): exactamente https://claude.ai/api/mcp/auth_callback
 * - Claude Code: loopback http://localhost|127.0.0.1:<puerto>/callback
 */
export type OAuthClientKind = 'Claude' | 'Claude Code' | null;

export interface OAuthRequest {
  /** Ya lo aprobó antes: solo hay que volver a esta URL. */
  redirectUrl: string | null;
  clientName: string;
  /** null = destino desconocido, solo se puede cancelar. */
  trustedClient: OAuthClientKind;
  email: string;
}

const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

function trustedClient(uri: string): OAuthClientKind {
  if (uri === CLAUDE_CALLBACK) return 'Claude';
  try {
    const url = new URL(uri);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol === 'http:' && loopback && url.pathname === '/callback' && !url.username && !url.password) {
      return 'Claude Code';
    }
  } catch { /* URI inválida: se bloquea */ }
  return null;
}

export async function getOAuthRequest(authorizationId: string): Promise<OAuthRequest> {
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) throw new ApiError('La solicitud de acceso no existe o caducó. Vuelve a conectar desde Claude.', error?.code);
  if (!('authorization_id' in data)) return { redirectUrl: data.redirect_url, clientName: '', trustedClient: null, email: '' };
  return {
    redirectUrl: null,
    clientName: data.client.name,
    trustedClient: trustedClient(data.redirect_uri),
    email: data.user.email,
  };
}

/** Aprueba o rechaza y devuelve la URL a la que hay que volver (la del cliente). */
export async function answerOAuthRequest(authorizationId: string, approve: boolean): Promise<string> {
  const options = { skipBrowserRedirect: true };
  const { data, error } = approve
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, options)
    : await supabase.auth.oauth.denyAuthorization(authorizationId, options);
  if (error || !data) throw new ApiError('No se pudo completar la autorización', error?.code);
  return data.redirect_url;
}
