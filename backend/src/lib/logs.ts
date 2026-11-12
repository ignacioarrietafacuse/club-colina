import type { FastifyRequest } from "fastify";
import { vieneDelProxy } from "./limite-intentos";

/**
 * Rutas públicas cuyo último segmento es un token (link de familia, link del segundo
 * apoderado y credencial QR). Un token en un log es una credencial filtrada.
 */
const RUTA_CON_TOKEN = /(\/api\/public\/(?:familia|completar|credencial)\/)[^/?#]+/gi;

export function censurarUrl(url: string): string {
  return url.replace(RUTA_CON_TOKEN, "$1[censurado]");
}

/** Lo que se loguea de una petición que no calzó con ninguna ruta (404). */
export const SIN_RUTA = "(sin ruta)";

/**
 * Solo la ruta, sin la consulta: el buscador del panel (`?q=`) lleva RUT, teléfonos y nombres,
 * también de menores, y un filtro puede llevar cualquier cosa. Ningún log necesita los valores.
 */
export function rutaSinConsulta(url: string): string {
  const fin = url.search(/[?#]/);
  return fin === -1 ? url : url.slice(0, fin);
}

/**
 * Serializador del request para el logger de Fastify. En vez de la URL va el patrón de la ruta
 * (`/api/public/familia/:token`, `/api/panel/jugadores`): sin consulta, sin tokens y sin lo que
 * alguien escriba en una URL inventada. Un 404 no tiene patrón y se anota como `(sin ruta)`.
 * Nunca cabeceras. `proxy` dice si pasó por el middleware de Vercel (un booleano; nunca el
 * secreto ni la IP del usuario).
 */
export function serializarRequest(request: FastifyRequest) {
  return {
    method: request.method,
    url: request.routeOptions.url ?? SIN_RUTA,
    remoteAddress: request.ip,
    proxy: vieneDelProxy(request),
  };
}

/**
 * Último filtro antes de escribir una línea (hook `logMethod` de pino):
 * - Un `{ err }` sin mensaje recibe uno fijo. Si no, pino copia `err.message` en `msg` antes de
 *   cualquier serializador, y ahí drizzle pone la consulta con sus parámetros y Fastify la URL
 *   completa ("Reply was already sent ... in "/api/...?q=..."").
 * - Un mensaje de texto pierde lo que parezca una consulta y los tokens de las rutas públicas.
 */
/** Modifica `args` en el lugar (pino los pasa tal cual al método). */
export function limpiarArgumentosDeLog(args: unknown[]): void {
  const [primero, segundo] = args;
  if (typeof primero === "object" && primero !== null && "err" in primero && typeof segundo !== "string") {
    const err: unknown = Reflect.get(primero, "err");
    const codigo = typeof err === "object" && err !== null ? Reflect.get(err, "code") : undefined;
    args.splice(1, 0, `error${typeof codigo === "string" ? ` ${codigo}` : ""}`);
  }
  args.forEach((a, i) => {
    if (typeof a === "string") args[i] = censurarUrl(a.replace(/\?[^\s"'`]*/g, ""));
  });
}
