# Finanzas personales

App web de finanzas personales para un solo usuario por cuenta (multiusuario vía Supabase Auth, pero cada usuario solo ve lo suyo).

## Qué gestiona la app

1. **Cuentas / dónde está la plata**: cada cuenta tiene un nombre y un tipo de ente (ej. "N26" → banco, "Billetera" → efectivo, "Trade Republic" → broker).
2. **Deudas**: personas que me deben dinero y personas a las que les debo, con pagos parciales.
3. **Inversiones**: aportes + valoraciones que se actualizan a mano cada tanto. De ahí sale la rentabilidad.
4. **Ingresos y gastos fijos**: recurrentes, con frecuencia (mensual, trimestral, semestral, anual).
5. **Gastos variables**: gasto a gasto, clasificados con un **sistema de etiquetas** libre (muchas etiquetas por gasto).

El detalle de las entidades y las reglas de negocio está en [docs/domain.md](docs/domain.md). **Es obligatorio leerlo antes de tocar código.**

## Stack

- Frontend: Vite + TypeScript (vanilla, sin framework) en `src/`.
- Backend: Supabase (Postgres + Auth + RLS). Migraciones en `supabase/migrations/`.
- Cliente: `@supabase/supabase-js`, usado **solo** dentro de `src/api/`.
- MCP de Supabase (lectura y escritura) en `.mcp.json`. Solo lo usa el agente backend, con las reglas de [docs/backend.md](docs/backend.md).
- Variables de entorno en `.env.local` (no se commitea): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## División del trabajo

Hay dos agentes. Cada uno tiene sus reglas y su zona de archivos:

| Agente | Reglas | Es dueño de |
|---|---|---|
| Backend | [docs/backend.md](docs/backend.md) | `supabase/**`, `src/api/supabase.ts`, `src/api/database.types.ts` |
| Frontend | [docs/frontend.md](docs/frontend.md) | `src/**` excepto los archivos del backend, `index.html`, `public/**` |

El diseño visual está en [docs/design.md](docs/design.md) y en el mockup navegable [docs/mockup.html](docs/mockup.html).

El punto de unión es el **contrato** en [docs/data-contract.md](docs/data-contract.md): esquema de la base, vistas, funciones RPC y la interfaz TypeScript `FinanceApi` (`src/api/types.ts`).

- `src/api/types.ts` es compartido: ningún agente lo cambia sin cambiar antes `docs/data-contract.md` en el mismo commit.
- Ningún agente edita archivos de la zona del otro. Si necesita algo del otro lado, lo deja anotado en la sección "Pendientes" del contrato.
- El frontend puede avanzar con `src/api/mock.ts` (implementación en memoria de `FinanceApi`) mientras el backend no esté listo.

## Convenciones generales

- Identificadores de código y de base de datos en **inglés** (`accounts`, `owed_to_me`). Textos de la interfaz en **español**.
- Importes: `numeric(14,2)` en la base, `number` en TS. Siempre positivos salvo donde el dominio dice lo contrario (aportes negativos = retiradas).
- Fechas: `date` en la base, string `YYYY-MM-DD` en TS. Timestamps solo para auditoría (`created_at`).
- Una sola moneda por usuario (`profiles.currency`, por defecto `EUR`). Multimoneda queda fuera del alcance de la v1.
- Los cálculos agregados (patrimonio, rentabilidad, totales por etiqueta, saldo de deudas) los hace la base en vistas; el frontend no los recalcula por su cuenta salvo para formatear.
- No commitear secretos ni `.env.local`.
