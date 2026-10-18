# Combos y menús

Panel → **Carta → Combos y menús**. Solo gerentes. Incluido en el producto base.

## Cómo funciona

- Un combo es un **menú a precio cerrado** (p. ej. «Menú mollete», 12,50 €) con **pasos**: «Elige tu mollete», «Elige tu bebida», «Elige tu postre».
- En cada paso el dueño elige qué productos entran (por categorías enteras o uno a uno) y, si quiere, un **suplemento** por producto (p. ej. +2 € por una burger).
- El cliente elige uno por paso. El **pan, la guarnición y los extras** de cada producto se eligen igual que en la carta; los extras de pago se suman. Esto incluye **«Añade complementos»** (entrantes como patatas, fingers o bolitas de jalapeño) en molletes y burgers.
- **Pasos opcionales**: en el editor, cada paso tiene la casilla «Opcional». El cliente puede no elegir nada en ese paso; ve «Opcional» y una primera opción «No, gracias», y la tarjeta del menú lo marca «(opcional)». Al menos un paso tiene que ser obligatorio. Ejemplo: Estafetén tiene «4. Complementos (opcional)» en el Menú mollete, con los 12 entrantes y su precio como suplemento.
- Los combos se crean en la categoría **«Menús»**, que aparece la primera de la carta (se crea sola con el primer combo).
- Solo se ofrecen los productos disponibles en ese momento: un producto agotado desaparece del paso sin tocar el combo.
- «Agotar» quita el combo de la carta sin borrarlo.

## Precio, cocina y stock

- Precio = precio del menú + suplementos + extras de pago. Lo recalcula el servidor; nunca se fía del navegador.
- En el pedido (panel y confirmación) se ve el menú con lo elegido en cada paso, por ejemplo «Genil (Pan tradicional, Patatas fritas) · Agua con gas · Pionono».
- Con el módulo Costes, el stock se descuenta de las recetas de los **productos elegidos** (y de sus opciones), no del combo.
- Informes: el combo cuenta como un producto de la categoría «Menús».
- Fidelización: el premio se calcula sobre productos sueltos; un combo no entra en «bocadillo + bebida gratis».

## Técnica

- Tablas `ComboSlot` y `ComboSlotItem` y la columna `Product.isCombo` (migración `20261016220000_combos`). `ComboSlot.required` (migración `20261018150000_combo_optional_slots`): `false` = paso opcional; `priceCombo` lo deja sin elegir.
- Lógica pura en `src/app/lib/combos.ts`: `priceCombo` valida una elección por paso, opciones válidas y producto de la lista.
- API del panel: `GET/POST /api/admin/[tenant]/combos` y `PATCH/DELETE /api/admin/[tenant]/combos/[id]`.
- Pedido: cada línea de combo lleva `comboChoices: [{ slotId, productId, optionIds }]`. En el snapshot de la línea se guarda un modificador por paso, con `groupCode: "COMBO"`.
