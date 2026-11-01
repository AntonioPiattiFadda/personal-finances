# Tarea: aplicar el backend al proyecto Supabase remoto

Proyecto remoto: `urbpynuotkjyioblmtum` (URL `https://urbpynuotkjyioblmtum.supabase.co`).
Antes de empezar, lee `CLAUDE.md`, `docs/backend.md` y `docs/data-contract.md`. Eres el agente **backend**: solo tocas `supabase/**`, `src/api/supabase.ts`, `src/api/database.types.ts`, y `src/api/types.ts` junto con `docs/data-contract.md`.

## Estado actual

- En el remoto solo está aplicada `profiles_and_accounts` (versión remota `20261101220654`, que corresponde al archivo `20261101210000_profiles_and_accounts.sql`). Tablas: `profiles` y `accounts`, ambas vacías.
- Las migraciones nuevas ya están escritas y probadas en local (`supabase db reset`, pruebas SQL de reglas y RLS con dos usuarios, E2E de `src/api/supabase.ts`). **No las edites**: hay que aplicarlas tal cual.
- `src/api/supabase.ts` ya implementa toda la `FinanceApi` contra este esquema.
- Desde la extensión de VS Code, las herramientas de escritura del MCP de Supabase (`apply_migration` y `execute_sql` con DDL) devolvían siempre "declined" sin que llegara a aparecer ninguna confirmación. Las de lectura funcionan. Si te pasa lo mismo, usa el plan B.

## Plan A: con el MCP de Supabase

Aplica estas migraciones **en este orden**, con `apply_migration` (`project_id = urbpynuotkjyioblmtum`). En `name` va el nombre del archivo sin el timestamp y en `query` el contenido **literal** del archivo:

| # | Archivo | `name` |
|---|---|---|
| 1 | `supabase/migrations/20261101230000_tags_and_expenses.sql` | `tags_and_expenses` |
| 2 | `supabase/migrations/20261101230100_recurring_items.sql` | `recurring_items` |
| 3 | `supabase/migrations/20261101230200_investments.sql` | `investments` |
| 4 | `supabase/migrations/20261101230300_debts.sql` | `debts` |
| 5 | `supabase/migrations/20261101230400_summary.sql` | `summary` |
| 6 | `supabase/migrations/20261101230500_grants.sql` | `grants` |

Hay dependencias entre ellas: la 1 crea helpers que usan la 2, la 3 y la 4; la 5 usa las vistas de la 3 y la 4; la 6 da permisos sobre todo lo anterior. Si una falla, **para**: no sigas con la siguiente ni intentes arreglarlo editando el archivo. Informa del error.

## Plan B: con la CLI (si el MCP no deja escribir)

Lo ejecuta el usuario en PowerShell, desde la raíz del repo:

```
supabase login
supabase link --project-ref urbpynuotkjyioblmtum
supabase migration repair --status reverted 20261101220654
supabase migration repair --status applied 20261101210000
supabase db push
```

Los dos `repair` alinean el historial: la primera migración se aplicó en remoto con otra versión que la del archivo. Sin ellos, `db push` se queja.

**No** ejecutes `supabase/seed.sql` en el remoto: es solo para local (crea el usuario `demo@example.com`).

## Verificación (después de A o de B)

1. `list_tables` (schema `public`): deben aparecer 12 tablas, todas con `rls_enabled: true`: `profiles, accounts, tags, expenses, expense_tags, recurring_items, recurring_item_tags, investments, investment_contributions, investment_valuations, debts, debt_payments`.
2. `execute_sql` (solo lectura) para comprobar vistas y funciones:
   ```sql
   select table_name from information_schema.views where table_schema = 'public' order by 1;
   -- esperado: v_debt_balances, v_debt_people, v_expenses, v_expenses_by_tag_month,
   --           v_investment_stats, v_money_by_location, v_net_worth, v_recurring_monthly, v_tag_usage
   select routine_name from information_schema.routines where routine_schema = 'public' order by 1;
   -- deben estar: create_expense, update_expense, delete_expense, set_recurring_item,
   --   create_investment, add_contribution, add_debt_payment, delete_debt_payment, delete_debt,
   --   set_account_balance, get_month_summary (+ helpers y triggers)
   select grantee, count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated') group by 1;
   -- anon no debe tener ninguna fila
   ```
3. `get_advisors` con `security` y con `performance`. Corrige lo que salga con una **migración nueva** (archivo nuevo en `supabase/migrations/` y luego `apply_migration`), nunca editando las existentes. Avisos esperables y aceptables: "unused index", porque aún no hay datos.
4. Regenera los tipos con `generate_typescript_types` (`project_id = urbpynuotkjyioblmtum`) y sobrescribe `src/api/database.types.ts` con el resultado.
5. `npm run build`. Si el único error está en `src/api/mock.ts` (faltan `listTagUsage`, `listDebtPeople`, `getMonthSummary`), es del frontend y lo está resolviendo otro agente: no lo toques. Cualquier error en `src/api/supabase.ts` sí es tuyo.
6. En `docs/data-contract.md`, sección "Estado de la implementación Supabase", sustituye la línea "Pendiente de aplicar en el proyecto remoto…" por "Aplicado en el proyecto remoto (`urbpynuotkjyioblmtum`)".

## Reglas

- `execute_sql` solo para lecturas. Nada de `drop`, `truncate`, `delete` o `alter` por ahí.
- Antes de cualquier operación destructiva sobre el remoto, pide confirmación al usuario.
- No pongas claves en archivos commiteados: URL y anon key van en `.env.local` (salen de `get_project_url` / `get_publishable_keys`).

## Resultado esperado

Informa al usuario de:
- qué migraciones quedaron aplicadas;
- el resultado de los advisors y qué corregiste;
- si `database.types.ts` cambió respecto al generado en local;
- el resultado de `npm run build`.
