// Servidor MCP remoto (Streamable HTTP, sin estado) para conectar Claude con la app.
// Endpoint: /api/mcp. Las tools de negocio se añaden en registerTools().
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

function registerTools(server: McpServer) {
  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Comprueba que la conexión con el servidor de finanzas personales funciona.',
    },
    async () => ({
      content: [{ type: 'text', text: `pong (${new Date().toISOString()})` }],
    }),
  )
}

async function handle(request: Request): Promise<Response> {
  const icon = (path: string) => new URL(path, request.url).href
  const server = new McpServer({
    name: 'personal-finances',
    title: 'Finanzas personales',
    version: '0.1.0',
    icons: [
      { src: icon('/icon-512.png'), mimeType: 'image/png', sizes: ['512x512'] },
      { src: icon('/icon-192.png'), mimeType: 'image/png', sizes: ['192x192'] },
      { src: icon('/favicon-64.png'), mimeType: 'image/png', sizes: ['64x64'] },
    ],
  })
  registerTools(server)

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export { handle as GET, handle as POST, handle as DELETE }
