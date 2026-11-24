# Manual de uso del panel

El manual es **digital y se actualiza sin parar**: un archivo Markdown por sección en `docs/manual/`. De ahí lo leen:

- **Ayuda** en el panel (`/admin/[tenant]/ayuda`, en el menú lateral, para todo el equipo): secciones plegables y buscador. Un enlace «Ayuda → Caja» abre esa sección.
- **NORA** (herramienta `como_se_hace`): busca los temas que mejor encajan con la pregunta y responde con ellos.

Cambiar el manual = cambiar el archivo y publicar. No hace falta tocar código, salvo para **añadir una sección nueva**: se añade a `MANUAL_SECTIONS` en `src/app/admin/[tenant]/(panel)/panelLinks.ts` (orden del menú).

## Formato de cada archivo

```
# Nombre del apartado (como en el menú)

Una o dos frases: para qué sirve.

**Dónde:** Menú → Nombre

## Tarea o pregunta como la diría el dueño («Abrir la caja»)

1. Pasos cortos con los botones entre «».
2. Rutas del panel como **Carta → Productos** (se convierten en enlaces).
```

- Cada `##` es un tema que se entiende solo (NORA enseña uno a uno).
- Solo cosas que existen: si cambia un botón o una pantalla, se cambia aquí en la misma PR.
- Nada técnico, ni claves, ni datos personales.

## Enlaces

`panelLinks.ts` convierte las rutas en enlaces solo si el apartado existe (lista de apartados, pestañas y secciones de Configuración). Las pestañas se abren con `?tab=` (Carta, Clientes y Costes, hook `useTabFromUrl`). En el chat se enlaza una ruta en negrita (`**Costes → Inventario**`, `**Caja**`) o una «Apartado → pestaña» en texto normal; una palabra suelta en texto normal no.

## Técnica

- `src/app/lib/manual.ts`: lee y trocea los archivos (en Vercel se incluyen con `outputFileTracingIncludes` en `next.config.ts`) y la búsqueda.
- `src/app/admin/[tenant]/(panel)/RichText.tsx`: pinta el texto con listas, negritas y enlaces (NORA y Ayuda).
- Pruebas: `src/app/lib/__tests__/manual.test.ts` (también comprueba que existen todas las secciones).
