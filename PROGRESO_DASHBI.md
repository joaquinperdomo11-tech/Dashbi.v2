# Progreso Dashbi v2

> Registro de bugs resueltos, features agregadas y decisiones tomadas, sesión por sesión. Se entrega actualizado junto con cada zip de código.

---

## Sesión — Feature: Categoría de ML + Combos en Productos

**Pedido:** ampliar la sección Productos para mostrar categoría (traída de ML) y permitir armar combos (una publicación de ML cuyo SKU representa la venta conjunta de otros SKUs propios, ej: "Mesa + 2 sillas" = 1 mesa + 2 sillas), más 5 cards de resumen arriba de la tabla.

### Decisiones tomadas
- **Stock: solo lectura por ahora.** No se creó tabla de inventario propio ni edición manual de cantidades. El stock sigue siendo 100% `publicaciones.availableQuantity`, sincronizado de ML. Confirmado explícitamente por el usuario: **a futuro** se va a leer la venta de un combo (vía sync de órdenes) y escribir el descuento de stock correspondiente en los componentes — eso queda fuera de esta entrega.
- **Categoría: viene de ML**, no es un campo propio editable. Se agrega `category_id`/`category_name` a `publicaciones`, poblado por el cron `sync-publicaciones` sin llamadas extra costosas (el payload de `/items?ids=...` ya trae `category_id`; el nombre se resuelve con `/categories/{id}`, cacheado por los IDs únicos de cada batch de 20 items).
- **Combos: SKU real de ML + receta manual.** Un combo es una publicación real (con su propio SKU/item_id en ML). El usuario define manualmente qué otros SKUs propios lo componen y en qué cantidad (ej: 1 mesa + 2 sillas). Esto es metadata de configuración, no stock — por eso sí se escribe a DB (tablas `combos` y `combo_componentes`), a diferencia del stock que es solo lectura.
- **Stock del combo: calculado al vuelo, nunca persistido.** `stock_disponible_combo = min(floor(stock_componente / cantidad_necesaria))` sobre todos los componentes de la receta. No hay resta real ni ledger — es una métrica derivada del stock actual (ML) de cada componente.
- **Costo del stock (card): sobre todo lo cargado con costo**, activo o no en ML. Para combos usa el stock calculado; para individuales, el stock de ML.
- **Precio de venta promedio (card):** simple, sobre publicaciones activas con precio > 0.

### Cambios de schema (`lib/db/schema.ts`)
- `publicaciones`: nuevas columnas `categoryId`, `categoryName`.
- Tabla nueva `combos`: `id`, `tenantId`, `comboSku`, `nombre`, `createdAt`, `updatedAt`. Único por `(tenantId, comboSku)`.
- Tabla nueva `comboComponentes`: `id`, `comboId` (FK a `combos`), `componentSku`, `cantidad`.
- **SQL para correr manualmente en Neon antes de deployar:** `sql/2026-07-29_productos_categoria_y_combos.sql` (no va al repo).

### Archivos modificados/nuevos
- `app/api/cron/sync-publicaciones/route.ts` — extrae `category_id` del payload ya obtenido en `/items?ids=...` y resuelve `category_name` vía `/categories/{id}`, cacheado por batch (máx. ~20 fetches por corrida, generalmente menos por categorías repetidas).
- `app/api/data/productos/route.ts` — agrega categoría a la respuesta, calcula combos (stock derivado, no persistido) y devuelve el objeto `cards` con los 5 agregados.
- `app/api/data/combos/route.ts` *(nuevo)* — GET lista combos + receta, POST crea/edita (upsert por `comboSku`, reemplaza la receta completa), DELETE borra un combo. Solo toca metadata, nunca stock.
- `app/(app)/productos/page.tsx` — 5 cards arriba (Tipo, Activos, Total, Costo del stock, Precio promedio), columna Categoría en la tabla, filtro Individual/Combo, badge "COMBO" + desglose de receta en la fila, columna Stock muestra el valor calculado para combos (marcado como "(calc.)"), y sección nueva "Combos" con formulario para crear/editar/borrar recetas.

### Pendiente / próxima iteración (ya charlado, no hace falta volver a preguntar)
- Leer la venta de un combo desde el sync de órdenes y **escribir** el descuento de stock real en los componentes (hoy es 100% calculado, no persistido).
- Evaluar si conviene guardar snapshot histórico de `category_name` (por si ML la renombra) — no es necesario por ahora.
