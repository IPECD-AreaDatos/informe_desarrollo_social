import { APP_BASE_PATH } from "@/lib/basePath";

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, "");
}

/**
 * Origen para `fetch` a las rutas `src/app/api/**` de esta misma app.
 * Con `basePath` en Next, el API no está en `/api/...` sino en `{basePath}/api/...`.
 * Si `NEXT_PUBLIC_API_URL` no está (p. ej. Docker sin .env), usamos `APP_BASE_PATH`.
 */
export function apiBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (env) return trimTrailingSlashes(env);
  return APP_BASE_PATH;
}

/** Ruta absoluta en el sitio (mismo host) o URL completa + sufijo `/api/...`. */
export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${apiBaseUrl()}${p}`;
}
