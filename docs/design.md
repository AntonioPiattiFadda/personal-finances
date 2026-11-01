# Diseño

La referencia visual es [docs/mockup.html](mockup.html): ábrelo en el navegador y navega por todas las pantallas. El frontend real tiene que verse y comportarse igual. El mockup usa datos inventados y no guarda nada; su código es solo de referencia, no se copia tal cual (allí no se escapa el HTML ni se usa la API).

## Tokens (en `:root`, con versión oscura)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--bg` | `#f6f7f9` | `#0f1115` | fondo de página |
| `--surface` | `#ffffff` | `#171a20` | tarjetas, sidebar, inputs |
| `--surface-2` | `#f1f3f5` | `#1f232b` | botón secundario, fondo de barras, hover |
| `--border` | `#e3e6ea` | `#2a2f39` | bordes y separadores |
| `--text` | `#1b1f24` | `#e8eaee` | texto |
| `--muted` | `#68707c` | `#9aa2ae` | etiquetas y texto secundario |
| `--accent` | `#4f46e5` | `#8b85ff` | botón principal, nav activa, barras |
| `--accent-soft` | `#eef0ff` | `#23234a` | fondo de la nav activa |
| `--pos` / `--neg` | `#12805c` / `#c92a2a` | `#3ccf91` / `#ff6b6b` | ganancias / pérdidas |

- Radios: tarjetas 14px, inputs y botones 10px, chips 99px.
- Tipografía: `system-ui`. Base 15px. Números con `font-variant-numeric: tabular-nums`.
- Tema: sigue al sistema (`prefers-color-scheme`), con un botón que lo fuerza con `data-theme="light|dark"` en `<html>`.

## Layout

- Escritorio: sidebar fija de 220px con la navegación y contenido de 1180px como máximo.
- Móvil (≤ 680px): la navegación pasa a una barra inferior con scroll horizontal (icono arriba, texto debajo), con un margen lateral de 16px y las columnas secundarias ocultas (`.hide-sm`).
- Grids de 2, 3 y 4 columnas que pasan a 1 o 2 columnas en pantallas estrechas.

## Componentes

- **Tarjeta** (`.card`): superficie con borde y sombra suave. La tarjeta destacada (`.hero`, patrimonio neto) lleva un degradado de acento a violeta y el texto en blanco.
- **Stat**: una etiqueta pequeña en gris y el valor grande debajo.
- **Chip de etiqueta**: punto de color y nombre, con el fondo al 14% del color de la etiqueta (`color-mix`). En los formularios es un botón que se activa o desactiva; inactivo queda con opacidad .55. "Sin etiqueta" va en gris `#868e96`.
- **Barra** (`.bar`): pista de 8px con relleno de color. Se usa para los totales por etiqueta, el dinero por ubicación, el progreso de pago de una deuda y lo gastado del disponible.
- **Fila** (`.row`): icono o avatar, texto que ocupa el espacio y un importe a la derecha, separadas por borde superior.
- **Tabla**: cabeceras en mayúsculas pequeñas y grises, importes alineados a la derecha.
- **Botones**: principal (`.btn`), secundario (`.btn.ghost`), pequeño (`.sm`) e icono (`.icon-btn`, se pone rojo al hacer hover cuando borra).
- **Avatar de persona** (deudas): círculo con la inicial y un color fijo por persona.

## Reglas de contenido

- Importes siempre con signo cuando se trata de una ganancia o una diferencia (`+12,50 €` / `−8,00 €`), además del color.
- Rentabilidad con un decimal: `+14,8 %`. La anualizada lleva siempre "aprox.".
- Cada tarjeta de inversión muestra "actualizado dd/mm/aaaa" y cada cuenta la fecha de su último saldo.
- Bajo los totales por etiqueta va la nota de que un gasto con varias etiquetas suma en cada una.
