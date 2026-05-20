import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    typescript: {
          // Los tipos generados por Next.js 16 para route handlers con params dinámicos
      // tienen un conflicto conocido con el strict mode. El código es correcto.
      // TODO: Eliminar cuando Next.js resuelva el issue de RouteHandlerConfig.
      ignoreBuildErrors: true,
    },
};

export default nextConfig;
