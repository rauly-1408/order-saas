# NORA, «pregúntale al panel» (asistente con IA)

El gerente pregunta en lenguaje normal, escribiendo o con el micro, y la IA responde con los datos del restaurante.

- **Dónde:** burbuja flotante abajo a la derecha en todo el panel, como un chat de ayuda (en el ordenador pone «NORA»). En el ordenador la ventana sale de la burbuja y deja ver el panel; en el móvil ocupa casi toda la pantalla. No sale en Caja, Mesas ni Pantalla de cocina (tienen su barra abajo) ni en el login. Los avisos de pedidos suben para no taparla. Solo la ven los usuarios que gestionan el restaurante.
- **Cómo responde:** primero el dato o lo que hay que hacer, luego un paso concreto con la ruta del panel. Corto y sin rodeos.
- **Preguntas frecuentes:** «¿cómo se hace…?» / «¿dónde está…?» las responde con la guía de `src/app/lib/assistantGuide.ts` (herramienta `como_se_hace`). Si algo cambia de sitio en el panel, hay que cambiarlo ahí. Si no está en la guía, lo dice y no se inventa botones.
- **Aprende de cada restaurante** (tabla `AssistantQuestion`): guarda cada pregunta (normalizada) y cuántas veces se hace; las más hechas pasan a ser las sugerencias del chat vacío. Cada respuesta lleva 👍/👎: las de 👍 le sirven de modelo y las de 👎 de aviso para responder distinto. Solo usa lo de ese restaurante; máx. 300 preguntas por restaurante (se borran las más antiguas).
- **Qué sabe:** cómo se hace cada cosa del panel; ventas de un periodo (hoy, ayer, 7 días, 30 días, este mes, mes pasado) con comparación y productos más y menos vendidos; buscar productos; productos agotados; ingredientes bajo mínimos; pedidos en marcha y mesas abiertas.
- **Qué puede cambiar:** nada por su cuenta. Para agotar o volver a poner a la venta un producto lo **propone** y el panel enseña un botón; el cambio se guarda solo al tocarlo (mismo endpoint que Carta).
- **Permisos:** las ventas solo se enseñan si el usuario tiene «Ve lo recaudado».
- **Voz:** reconocimiento de voz del navegador (es-ES). Si el navegador no lo tiene, el micro no aparece.

## Técnica

- `src/app/lib/assistant.ts`: herramientas (solo lectura, siempre filtradas por `tenantId`), bucle con Claude (`claude-opus-5-5`, esfuerzo bajo, máx. 6 vueltas) y limpieza de la conversación.
- `POST /api/admin/[tenant]/assistant` con `{ messages: [{ role, text }] }` → `{ reply, actions, questionId }`. Gerentes, 30 preguntas cada 10 min. `GET` → `{ suggestions }`.
- `POST /api/admin/[tenant]/assistant/valorar` con `{ questionId, helpful }` (👍/👎).
- `src/app/lib/assistantMemory.ts`: guardar preguntas, valoraciones, sugerencias y el texto «lo aprendido» que va al prompt (marcado como datos, no instrucciones).
- `src/app/admin/[tenant]/(panel)/Assistant.tsx`: la burbuja y la ventana; la conversación vive mientras el panel está abierto.
- Necesita `ANTHROPIC_API_KEY` válida (sin ella responde «no está activado todavía»).
- Pruebas: `src/app/lib/__tests__/asistente.test.ts`.
