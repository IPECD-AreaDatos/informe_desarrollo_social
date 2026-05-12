import type { NextConfig } from "next";
import { APP_BASE_PATH } from "./src/lib/basePath";

/** Rutas sin prefijo → misma ruta bajo `basePath` (evita 404 si abrís /comedores en vez de /desarrollo-social/comedores). */
function redirectsSinBasePath() {
  const p = APP_BASE_PATH;
  const rutas = [
    "/",
    "/comedores",
    "/vulnerabilidad",
    "/educacion",
    "/salud",
    "/territorial",
    "/expedientes",
    "/demografia",
  ];
  return [
    {
      source: "/api/:path*",
      destination: `${p}/api/:path*`,
      permanent: false,
      basePath: false as const,
    },
    ...rutas.map((source) => ({
      source,
      destination: source === "/" ? `${p}/` : `${p}${source}`,
      permanent: false,
      basePath: false as const,
    })),
  ];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["ssh2", "mysql2"],
  output: "standalone",
  basePath: APP_BASE_PATH,
  async redirects() {
    return redirectsSinBasePath();
  },
};

export default nextConfig;
