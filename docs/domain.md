# Dominio y reglas de negocio

Este documento manda sobre cualquier otra decisión. Si algo no está aquí, se pregunta antes de inventarlo.

## Cuentas (dónde está la plata)

- Una cuenta = un lugar donde hay dinero: `name` libre + `type` de ente.
- Tipos: `bank` (Banco), `cash` (Efectivo), `savings` (Cuenta de ahorro), `broker` (Broker), `crypto` (Exchange cripto), `other` (Otro).
- `balance` es una **foto manual**: el usuario la actualiza mirando su banco. Cada actualización manual pone `balance_updated_at = now()`.
- Lo único que mueve el saldo automáticamente:
  - Un gasto variable creado con "descontar de la cuenta" (resta). Al borrar ese gasto, se devuelve.
  - Un pago de deuda asociado a una cuenta (suma si me pagan, resta si pago yo). Al borrar el pago, se revierte.
- Las cuentas no se borran si tienen movimientos: se archivan (`archived = true`). Las archivadas no suman al patrimonio y no aparecen en los selectores.

## Etiquetas

- Etiqueta = `name` + `color` (hex `#rrggbb`). Nombre único por usuario sin distinguir mayúsculas.
- Se aplican a **gastos variables** y a **ingresos/gastos fijos**. Un elemento puede tener 0..N etiquetas.
- Se pueden crear al vuelo desde el formulario de gasto.
- Borrar una etiqueta la quita de todos los elementos (no borra los gastos).
- **Totales por etiqueta**: un gasto con varias etiquetas suma su importe completo en cada una. Por eso la suma de los totales por etiqueta puede ser mayor que el total gastado; la interfaz lo debe aclarar. Los gastos sin etiquetas se agrupan como "Sin etiqueta".

## Gastos variables

- Campos: fecha, importe (> 0), descripción, cuenta opcional, etiquetas.
- `deducted`: si al crear se eligió descontar de la cuenta. Requiere `account_id`.
- Editar el importe o la cuenta de un gasto con `deducted = true` ajusta los saldos (revertir el anterior, aplicar el nuevo).

## Ingresos y gastos fijos

- `kind`: `income` | `expense`. Importe > 0, frecuencia `monthly` | `quarterly` | `semiannual` | `yearly`.
- Cuenta opcional (dónde entra/sale) y etiquetas.
- `active` permite pausarlos sin borrarlos. `start_date` / `end_date` opcionales.
- **Equivalente mensual** = importe × factor: mensual 1, trimestral 1/3, semestral 1/6, anual 1/12.
- No generan movimientos ni mueven saldos en la v1: son una previsión.
- "Disponible para gastos variables" del mes = ingresos fijos mensuales − gastos fijos mensuales (solo activos y vigentes en ese mes).

## Inversiones

- Una inversión tiene `name` y opcionalmente la cuenta/plataforma donde está (`account_id`, normalmente de tipo `broker` o `crypto`).
- **Aportes** (`investment_contributions`): fecha + importe. Positivo = meto dinero, negativo = retiro.
- **Valoraciones** (`investment_valuations`): fecha + valor total de la inversión en ese momento. El usuario las carga cada tanto.
- Crear una inversión = un aporte inicial + una valoración inicial con el mismo importe y fecha.
- Al registrar un aporte, se crea automáticamente una valoración con fecha del aporte y valor = última valoración + aporte (para que meter dinero no cuente como ganancia).
- Cálculos:
  - `invested` = suma de aportes.
  - `current_value` = valor de la valoración más reciente (por fecha, y a igualdad por `created_at`).
  - `gain` = `current_value − invested`.
  - `return_pct` = `gain / invested` (null si `invested <= 0`).
  - `annualized_pct` (aproximada) = `(current_value / invested)^(365 / días) − 1`, con días = desde el primer aporte hasta la última valoración. Null si días < 30 o `invested <= 0`. La interfaz la muestra como "aprox.".
- El saldo de la cuenta asociada **no** incluye el valor de la inversión (se suman por separado, sin doble conteo).

## Deudas

- `direction`: `owed_to_me` (me deben) | `i_owe` (debo). Persona (texto libre), importe original (> 0), descripción, fecha.
- **Pagos** parciales (`debt_payments`): fecha, importe (> 0), cuenta opcional. Un pago no puede superar lo pendiente.
- `remaining` = importe − suma de pagos. Saldada cuando `remaining = 0`.
- "Saldar" = registrar un pago por todo lo pendiente.
- La interfaz agrupa por persona y muestra el neto por persona (lo que me debe − lo que le debo).

## Patrimonio neto

```
patrimonio = Σ saldo de cuentas no archivadas
           + Σ current_value de inversiones no archivadas
           + Σ remaining de deudas owed_to_me
           − Σ remaining de deudas i_owe
```

"Dónde está la plata" = por cada cuenta: saldo + valor de las inversiones asociadas. Las inversiones sin cuenta van en "Sin ubicación".
