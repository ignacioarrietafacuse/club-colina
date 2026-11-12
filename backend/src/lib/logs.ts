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

/**
 * Serializador del request para el logger de Fastify: sin tokens, sin cabeceras. `proxy` dice si
 * pasó por el middleware de Vercel (un booleano; nunca el secreto ni la IP del usuario).
 */
export function serializarRequest(request: FastifyRequest) {
  return {
    method: request.method,
    url: censurarUrl(request.url),
    remoteAddress: request.ip,
    proxy: vieneDelProxy(request),
  };
}
