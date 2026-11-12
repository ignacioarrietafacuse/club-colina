/**
 * Routing Middleware de Vercel (corre antes de servir cualquier /api/*). Reenvía la petición al
 * backend en Railway con la cabecera `x-club-colina-proxy` = PROXY_SECRETO, para que el límite de
 * intentos confíe en `x-vercel-forwarded-for` (la IP real del usuario). Ver
 * backend/src/lib/limite-intentos.ts.
 *
 * Sin PROXY_SECRETO no toca nada: sigue la reescritura de vercel.json, y el backend usa la IP de
 * salida de Vercel (un contador compartido, pero nunca una IP falsificable).
 */
import { next, rewrite } from "@vercel/functions/middleware";

export const config = { matcher: "/api/:path*" };

export const BACKEND = "https://club-colina-production.up.railway.app";
export const CABECERA_PROXY = "x-club-colina-proxy";

export function reenviar(request: Request, secreto: string | undefined): Response {
  if (!secreto) return next();
  const entrante = new URL(request.url);
  const destino = new URL(entrante.pathname + entrante.search, BACKEND);
  const cabeceras = new Headers(request.headers);
  cabeceras.set(CABECERA_PROXY, secreto);
  return rewrite(destino, { request: { headers: cabeceras } });
}

export default function middleware(request: Request): Response {
  return reenviar(request, process.env.PROXY_SECRETO);
}
