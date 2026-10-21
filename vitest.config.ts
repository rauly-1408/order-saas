import { defineConfig } from "vitest/config";
import path from "node:path";

// Pruebas unitarias de la lógica pura (precios, menús, promociones, horarios…).
// `npm test`. No tocan la base de datos. Ver docs/OPERACIONES.md
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
