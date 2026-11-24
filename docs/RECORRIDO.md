# Recorrido guiado («nubes»)

La primera vez que alguien entra al panel sale una **bienvenida** (menú, plegar el menú, NORA, Ayuda) y, la primera vez que entra en cada **sección**, su recorrido: una nube señala cada parte (el resto de la pantalla se oscurece) y explica para qué sirve, con «Atrás», «Siguiente», «Saltar» y, al final, «Más en Ayuda».

- **Dónde se define:** `src/app/admin/[tenant]/(panel)/tourSteps.ts` (bienvenida y un recorrido por sección: Inicio, Caja, Pedidos, Mesas, Reservas, Pantalla de cocina, Facturas, Carta, Archivos, Clientes, Colaboradores, Informes, Costes, Configuración y Ayuda). El componente es `PanelTour.tsx` (montado en el layout del panel, para todo el equipo).
- **A qué apunta cada nube:** un selector CSS, opcionalmente con `::texto` (el que contenga ese texto) y alternativas con ` || `. Si el elemento no se ve (p. ej. el menú lateral en el móvil o una pestaña sin permiso), ese paso se salta. Sin elemento, la nube sale centrada.
- **Cuándo sale:** espera a que la pantalla esté cargada y a que no haya otra ventana encima (abrir la caja, un aviso) ni la animación de entrada. Se recuerda en el dispositivo (`localStorage` `norapp-tour:<sección>`). `norapp-tours-off = 1` lo desactiva (pruebas automáticas).
- **Repetirlo:** Ayuda → cada sección tiene «Ver el recorrido» (abre la sección con `?recorrido=1`); Uso general → «Ver la bienvenida otra vez».
- **Teclado:** Esc salta, ← → cambian de paso. **Táctil:** botones de 44 px; probado en tablet vertical y horizontal.
- Si cambia una pantalla, revisar sus pasos aquí (igual que su sección del manual).
