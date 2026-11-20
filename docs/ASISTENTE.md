# Pregúntale al panel (asistente con IA)

El gerente pregunta en lenguaje normal, escribiendo o con el micro, y la IA responde con los datos del restaurante.

- **Dónde:** botón «Pregúntale» en la barra superior (móvil y tablet) y «Pregúntale al panel» en el menú lateral (escritorio). Solo lo ven los usuarios que gestionan el restaurante.
- **Qué sabe:** ventas de un periodo (hoy, ayer, 7 días, 30 días, este mes, mes pasado) con comparación y productos más y menos vendidos; buscar productos; productos agotados; ingredientes bajo mínimos; pedidos en marcha y mesas abiertas.
- **Qué puede cambiar:** nada por su cuenta. Para agotar o volver a poner a la venta un producto lo **propone** y el panel enseña un botón; el cambio se guarda solo al tocarlo (mismo endpoint que Carta).
- **Permisos:** las ventas solo se enseñan si el usuario tiene «Ve lo recaudado».
- **Voz:** reconocimiento de voz del navegador (es-ES). Si el navegador no lo tiene, el micro no aparece.

## Técnica

- `src/app/lib/assistant.ts`: herramientas (solo lectura, siempre filtradas por `tenantId`), bucle con Claude (`claude-opus-5-5`, esfuerzo bajo, máx. 6 vueltas) y limpieza de la conversación.
- `POST /api/admin/[tenant]/assistant` con `{ messages: [{ role, text }] }` → `{ reply, actions }`. Gerentes, 30 preguntas cada 10 min.
- `src/app/admin/[tenant]/(panel)/Assistant.tsx`: la hoja; la conversación vive mientras el panel está abierto.
- Necesita `ANTHROPIC_API_KEY` válida (sin ella responde «no está activado todavía»).
- Pruebas: `src/app/lib/__tests__/asistente.test.ts`.
