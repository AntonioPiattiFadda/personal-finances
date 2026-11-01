// Servidor MCP remoto (Streamable HTTP, sin estado) para conectar Claude con la app.
//
//   GET  /api/mcp/.well-known/oauth-protected-resource   metadata OAuth (pública, sin token)
//   POST /api/mcp                                        JSON-RPC de MCP
//        header Authorization: Bearer <access token OAuth de Supabase Auth>
//
// Auth (mismo esquema que propelia): Supabase Auth es el servidor OAuth 2.1. Claude llama sin
// token → 401 con `WWW-Authenticate` que apunta a la metadata → se registra solo, el usuario
// aprueba en /oauth/consent (src/views/oauth.ts) y Claude recibe un access token de ese usuario.
// Aquí se valida el token con Supabase y todo corre con un cliente ARMADO CON ESE TOKEN: RLS y
// RPC igual que en la web. Nada de service role.
//
// Tools (api/_tools.ts): `finance_read` y `finance_write`, cada una con todas las operaciones
// de FinanceApi de su tipo.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createClient } from '@supabase/supabase-js'
import * as z from 'zod'
import type { Database } from '../src/api/database.types.js'
import { createSupabaseApi } from '../src/api/supabase.js'
import type { FinanceApi } from '../src/api/types.js'
import { describeOperations, READ_OPERATIONS, runOperation, WRITE_OPERATIONS } from './_tools.js'

declare const process: { env: Record<string, string | undefined> }

const METADATA_PATH = '/.well-known/oauth-protected-resource'

function env() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  return { url, anonKey }
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
  'Access-Control-Expose-Headers': 'www-authenticate, mcp-session-id',
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...headers },
  })
}

/** `resource` tiene que ser la URL que se pegó en Claude: la pública de este endpoint. */
function publicUrls(request: Request) {
  const resource = new URL('/api/mcp', request.url).href
  return { resource, metadata: `${resource}${METADATA_PATH}`, authorizationServer: `${env().url}/auth/v1` }
}

/**
 * Sin token: solo el puntero a la metadata. Con token vencido o inválido: `invalid_token`, que
 * es lo que hace que Claude use el refresh token o vuelva a pedir login.
 */
function unauthorized(request: Request, reason: 'missing' | 'invalid'): Response {
  const { metadata } = publicUrls(request)
  const challenge = reason === 'missing'
    ? `Bearer resource_metadata="${metadata}"`
    : `Bearer error="invalid_token", error_description="El token no es válido o venció", resource_metadata="${metadata}"`
  return json({ error: reason === 'missing' ? 'unauthorized' : 'invalid_token' }, 401, { 'WWW-Authenticate': challenge })
}

function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '')
  return match ? match[1].trim() || null : null
}

/** Valida el token contra Supabase Auth y devuelve el FinanceApi de ESE usuario (o null). */
async function authenticate(token: string): Promise<FinanceApi | null> {
  const { url, anonKey } = env()
  const client = createClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data } = await client.auth.getUser(token)
  if (!data.user) return null
  const userId = data.user.id
  return createSupabaseApi(client, async () => userId)
}

const INSTRUCTIONS =
  'Finanzas personales del usuario: cuentas, gastos variables con etiquetas, ingresos y gastos ' +
  'fijos, inversiones (aportes y valoraciones) y deudas. Importes en la moneda del usuario ' +
  '(finance_read → getCurrency), fechas YYYY-MM-DD, meses YYYY-MM. Usa finance_read para ' +
  'consultar y finance_write para cambiar algo; los ids (uuid) salen de las lecturas, así que ' +
  'busca el id antes de editar o borrar. Los totales (patrimonio, rentabilidad, resumen del mes) ' +
  'ya vienen calculados: no los recalcules.'

const paramsSchema = z.record(z.string(), z.unknown()).optional()
  .describe('Parámetros de la operación, como objeto (ver la lista en la descripción). Omitir si no lleva.')

function registerTools(server: McpServer, api: FinanceApi) {
  const readNames = Object.keys(READ_OPERATIONS) as [string, ...string[]]
  const writeNames = Object.keys(WRITE_OPERATIONS) as [string, ...string[]]

  server.registerTool(
    'finance_read',
    {
      title: 'Consultar finanzas',
      description: `Lee datos de las finanzas personales. No cambia nada.\n\nOperaciones:\n${describeOperations(READ_OPERATIONS)}`,
      inputSchema: { operation: z.enum(readNames), params: paramsSchema },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ operation, params }) => runOperation(READ_OPERATIONS, api, operation, params),
  )

  server.registerTool(
    'finance_write',
    {
      title: 'Modificar finanzas',
      description: `Crea, edita o borra datos de las finanzas personales (afecta a los saldos reales de la app).\n\nOperaciones:\n${describeOperations(WRITE_OPERATIONS)}`,
      inputSchema: { operation: z.enum(writeNames), params: paramsSchema },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    ({ operation, params }) => runOperation(WRITE_OPERATIONS, api, operation, params),
  )
}

async function handle(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  // vercel.json reescribe las rutas .well-known a /api/mcp?oauth_metadata=1.
  const url = new URL(request.url)
  if (url.pathname.endsWith(METADATA_PATH) || url.searchParams.has('oauth_metadata')) {
    const urls = publicUrls(request)
    return json({
      resource: urls.resource,
      authorization_servers: [urls.authorizationServer],
      bearer_methods_supported: ['header'],
      resource_name: 'Finanzas personales',
    })
  }

  const token = bearerToken(request)
  if (!token) return unauthorized(request, 'missing')
  const api = await authenticate(token)
  if (!api) return unauthorized(request, 'invalid')

  const icon = (path: string) => new URL(path, request.url).href
  const server = new McpServer(
    {
      name: 'personal-finances',
      title: 'Finanzas personales',
      version: '0.2.0',
      icons: [
        { src: icon('/icon-512.png'), mimeType: 'image/png', sizes: ['512x512'] },
        { src: icon('/icon-192.png'), mimeType: 'image/png', sizes: ['192x192'] },
        { src: icon('/favicon-64.png'), mimeType: 'image/png', sizes: ['64x64'] },
      ],
    },
    { instructions: INSTRUCTIONS },
  )
  registerTools(server, api)

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  const response = await transport.handleRequest(request)
  for (const [k, v] of Object.entries(corsHeaders)) response.headers.set(k, v)
  return response
}

export { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS }
