# Reglas del agente backend

Antes de empezar: leer `CLAUDE.md`, `docs/domain.md` y `docs/data-contract.md`.

## Zona de archivos

Puedes editar: `supabase/**`, `src/api/supabase.ts`, `src/api/auth.ts`, `src/api/client.ts`, `src/api/database.types.ts`, `.env.example`, y `src/api/types.ts` + `docs/data-contract.md` (solo juntos, ver abajo).
No toques el resto de `src/`, ni `index.html`, ni estilos.

## Base de datos

- Todo cambio de esquema es una migración nueva en `supabase/migrations/` (`YYYYMMDDHHMMSS_descripcion.sql`). Nunca edites una migración ya aplicada.
- RLS activado en **todas** las tablas desde la migración que las crea. Sin excepciones, sin `service_role` en el cliente.
- Vistas con `security_invoker = true`, si no saltan el RLS.
- Funciones RPC: `language plpgsql`, `security invoker`, `set search_path = public`. Validan los datos y lanzan errores en español.
- Toda regla que mueva saldos (gastos con descuento, pagos de deuda, aporte → valoración) vive en una RPC transaccional, nunca en el cliente.
- Índices en todas las FK y en `(user_id, date)` de `expenses`.
- Trigger que crea la fila de `profiles` al registrarse un usuario.
- Seed opcional en `supabase/seed.sql` con datos de ejemplo (cuentas N26 y Efectivo, unas cuantas etiquetas).

## MCP de Supabase

El proyecto tiene el MCP oficial de Supabase configurado en `.mcp.json` en modo **lectura y escritura**. Solo lo usa el agente backend.

- Las migraciones se escriben **primero como archivo** en `supabase/migrations/` y luego se aplican con `apply_migration` usando el mismo nombre. El archivo es la fuente de verdad; nunca apliques algo que no esté en el repo.
- `execute_sql` solo para consultas de lectura y pruebas. Nada de `drop`, `truncate`, `delete` o `alter` por ahí: todo cambio de esquema es una migración.
- Antes de cualquier operación destructiva (borrar tablas o datos, resetear, borrar branches o proyectos), pide confirmación al usuario.
- Después de cada migración: `get_advisors` (seguridad y rendimiento) y corrige lo que salga, sobre todo tablas sin RLS.
- Regenera `src/api/database.types.ts` con `generate_typescript_types` cada vez que cambie el esquema.
- La URL del proyecto y la anon key salen de `get_project_url` / `get_publishable_keys`. Van en `.env.local`, nunca en un archivo commiteado.

## Capa `src/api/`

- `client.ts`: crea el cliente Supabase con `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- `database.types.ts`: generado con `supabase gen types typescript`. No se edita a mano.
- `supabase.ts`: `export const api: FinanceApi`. Mapea snake_case → camelCase, convierte `numeric` a `number`, y envuelve todo error en `ApiError` con mensaje en español.
- `auth.ts`: magic link por email.
- No exportes nada de Supabase fuera de `src/api/`: el frontend no debe saber que existe.

## Cambios en el contrato

1. Edita `docs/data-contract.md` y `src/api/types.ts` en el mismo commit.
2. Si rompe algo que usa el frontend, déjalo anotado en "Pendientes" del contrato.
3. Después implementa la migración y `supabase.ts`.

## Verificación

- `supabase db reset` aplica todas las migraciones sin error.
- Probar las RPC con dos usuarios distintos: ninguno ve ni modifica datos del otro.
- `npm run build` pasa (tipos correctos en `src/api/`).
