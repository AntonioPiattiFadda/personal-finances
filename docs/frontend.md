# Reglas del agente frontend

Antes de empezar: leer `CLAUDE.md`, `docs/domain.md`, `docs/data-contract.md` y `docs/design.md`, y abrir `docs/mockup.html` en el navegador. El resultado tiene que coincidir con el mockup.

## Zona de archivos

Puedes editar: `src/**` (salvo `src/api/supabase.ts`, `src/api/auth.ts`, `src/api/client.ts`, `src/api/database.types.ts`), `index.html`, `public/**`, y `src/api/mock.ts`.
`src/api/types.ts` y `docs/data-contract.md` solo se cambian juntos, y avisando en "Pendientes".

## Datos

- No uses el MCP de Supabase: es del agente backend.

- Todo acceso a datos pasa por la interfaz `FinanceApi`. Prohibido importar `@supabase/supabase-js` o `src/api/supabase.ts` desde la UI.
- Un único punto elige la implementación: `src/api/index.ts` exporta `api` = mock o supabase según `import.meta.env.VITE_USE_MOCK === 'true'` o si faltan las variables de Supabase.
- `src/api/mock.ts` implementa `FinanceApi` en memoria (con `localStorage` opcional) respetando **todas** las reglas de `docs/domain.md` (descuento de saldo, aporte → valoración, pagos ≤ pendiente…), para que el cambio a Supabase sea transparente.
- No recalcules en la UI lo que ya devuelve la API (rentabilidad, patrimonio, pendiente de deudas, totales por etiqueta).
- Toda llamada a la API maneja el error mostrando `error.message` al usuario.

## Pantallas

1. **Resumen**: patrimonio neto (desglose cuentas / inversiones / me deben / debo), "Dónde está la plata" por ubicación, resumen del mes (ingresos fijos, gastos fijos, variables, lo que queda), gastos del mes por etiqueta (barras).
2. **Gastos**: formulario rápido arriba (importe con foco, descripción, fecha = hoy, cuenta, etiquetas como chips seleccionables + crear etiqueta al vuelo, check "descontar de la cuenta"). Filtros por mes, etiqueta y cuenta. Lista y totales por etiqueta.
3. **Fijos**: ingresos y gastos fijos separados, con equivalente mensual y totales.
4. **Inversiones**: tarjeta por inversión (aportado, valor actual, ganancia, rentabilidad, anualizada aprox., última actualización), acciones "Actualizar valor" y "Aportar / retirar", historial.
5. **Deudas**: "Me deben" y "Debo", agrupado por persona con neto, pago parcial y "Saldar". Saldadas plegadas aparte.
6. **Cuentas**: agrupadas por tipo, saldo editable inline, fecha de la última actualización, archivar.
7. **Etiquetas**: crear, renombrar, cambiar color, borrar (con confirmación), uso y total gastado.
8. **Ajustes**: moneda, cerrar sesión.

Más pantalla de login (magic link) si no hay sesión.

## Estilo y código

- Vite + TypeScript vanilla. Sin framework salvo que se acuerde y se actualice `CLAUDE.md`.
- Navegación por hash (`#resumen`, `#gastos`…).
- Todo texto que venga del usuario se escapa antes de meterlo en HTML.
- Textos en español. Importes con `Intl.NumberFormat('es-ES', { style: 'currency', currency })` usando la moneda del perfil. Fechas mostradas como `dd/mm/aaaa`.
- Ganancias en verde, pérdidas en rojo; nunca solo por color (signo `+`/`−` siempre visible).
- Usable en móvil (ancho 360 px) y con tema claro/oscuro según el sistema.
- Confirmación antes de borrar.

## Verificación

- `npm run build` pasa sin errores.
- La app funciona entera con el mock (`VITE_USE_MOCK=true npm run dev`).
