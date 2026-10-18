# Diseño de la tienda pública (carta)

`/pedir/[tenant]`. Toma como referencia la web de McDonald's: todo alineado a un mismo margen, portada a todo lo ancho y cada tipo de tarjeta con su propio aspecto. Los colores, las fuentes y las imágenes salen de **Configuración → Marca**.

## Estructura

1. **Franja de aviso** (solo con la tienda cerrada): «Ahora mismo estamos cerrados · abrimos hoy a las 20:00 · Puedes programar tu pedido».
2. **Cabecera fija y sólida**:
   - logo a la izquierda (el nombre solo se escribe si no hay logo);
   - a la derecha: estado Abierto/Cerrado, «A domicilio» (si se reparte con plataformas) y botón del pedido con el total y un contador.
3. **Portada a todo lo ancho**:
   - foto con zoom lento y velo oscuro a la izquierda para que se lea;
   - titular grande en la fuente de rótulo;
   - botones «Ver la carta» y «A domicilio».
4. **Categorías** fijas bajo la cabecera, alineadas con el contenido. La categoría activa se centra sola. En ordenador, al pasar el ratón por una categoría, esta se tiñe con el color de la marca.
5. **A domicilio** (si hay plataformas): bloque «Escoge quién te lo lleva».
6. **Promociones**: fila deslizante con la tarjeta de sellos y tarjetas de color, con el número grande («−15 %», «Envío gratis»), formas decorativas y un brillo al pasar el ratón. Alternan el color principal y el secundario.
7. **Menús (combos)**: tarjeta ancha con degradado del color principal, los pasos numerados («① Mollete + ② Bebida + ③ Postre»), «Todo por 12,50 €» y «Montar mi menú →».
8. **Productos**: tarjetas claras de 1, 2, 3 o 4 columnas según el ancho, botón «+ Añadir» y contador cuando ya está en el pedido. Los productos sin opciones se suman y restan desde la tarjeta.
9. **Pie** con el nombre y las redes.
10. **Barra flotante del pedido** con el total y «Ver pedido →».

## Animaciones

- Entrada escalonada del titular de la portada y zoom lento de la foto.
- Los bloques aparecen al hacer scroll (`data-reveal` + IntersectionObserver). Sin JavaScript se ven igual: solo se ocultan si el script está activo (`.s-js`).
- El total del pedido «salta» al añadir algo.
- Brillo en las promociones y regalo flotante en la tarjeta de sellos.
- Todo se desactiva con «reducir movimiento» del sistema (`prefers-reduced-motion`).

## Técnica

- `MenuClient.tsx`: estructura. `StoreCards.tsx`: `PromoTile`, `ComboCard` y `ProductCard`. `StampCard.tsx`: tarjeta de sellos.
- Animaciones: clases `s-*` en `globals.css`.
