/**
 * Routing Middleware de Vercel (corre antes de servir cualquier /api/*). Reenvía la petición al
 * backend en Railway con dos cabeceras propias:
 * - `x-club-colina-proxy` = PROXY_SECRETO, que prueba que pasó por acá;
 * - `x-club-colina-ip` = la IP del usuario según el borde de Vercel (`ipAddress()`).
 * El backend usa esa IP para el límite de intentos solo si el secreto coincide
 * (backend/src/lib/limite-intentos.ts).
 *
 * Sin PROXY_SECRETO no toca nada: sigue la reescritura de vercel.json, y el backend usa la IP de
 * salida de Vercel (un contador compartido, pero nunca una IP falsificable). Para volver atrás,
 * basta con quitar PROXY_SECRETO en Vercel y redesplegar, o volver al despliegue anterior.
 */
import { ipAddress } from "@vercel/functions/headers";
import { next, rewrite } from "@vercel/functions/middleware";

export const config = { matcher: "/api/:path*" };

/** Tiene que ser el mismo destino que la reescritura de /api en vercel.json (lo verifica un test). */
export const BACKEND = "https://club-colina-production.up.railway.app";
export const CABECERA_PROXY = "x-club-colina-proxy";
export const CABECERA_IP = "x-club-colina-ip";

/** Cabeceras que no se reenvían: las pone Vercel o son internas suyas. */
function seReenvia(nombre: string): boolean {
  const n = nombre.toLowerCase();
  return !(
    n === "host" ||
    n.startsWith("x-vercel-") ||
    n.startsWith("x-forwarded-") ||
    n === "x-real-ip" ||
    n === "forwarded" ||
    n.startsWith("x-middleware-") ||
    n.startsWith("x-club-colina-")
  );
}

export function reenviar(request: Request, secreto: string | undefined): Response {
  if (!secreto) return next();
  const entrante = new URL(request.url);
  // Nunca `new URL(ruta, BACKEND)`: una ruta como "//otro.com" cambiaría de dominio y el secreto
  // saldría hacia otro sitio. Se arma sobre el origen del backend y se verifica.
  const destino = new URL(BACKEND);
  destino.pathname = entrante.pathname;
  destino.search = entrante.search;
  if (destino.origin !== new URL(BACKEND).origin || !destino.pathname.startsWith("/api/")) {
    return next();
  }
  const cabeceras = new Headers();
  for (const [nombre, valor] of request.headers) {
    if (seReenvia(nombre)) cabeceras.set(nombre, valor);
  }
  cabeceras.set(CABECERA_PROXY, secreto);
  const ip = ipAddress(request);
  if (ip) cabeceras.set(CABECERA_IP, ip);
  return rewrite(destino, { request: { headers: cabeceras } });
}

export default function middleware(request: Request): Response {
  return reenviar(request, process.env.PROXY_SECRETO);
}
