import { isIP } from "node:net";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { tokensIguales } from "./tokens";

/** Cabecera que agrega el middleware de Vercel (frontend/middleware.ts) con PROXY_SECRETO. */
export const CABECERA_PROXY = "x-club-colina-proxy";

function primera(valor: string | string[] | undefined): string | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  const ip = texto?.split(",")[0]?.trim();
  return ip && isIP(ip) ? ip : undefined;
}

/**
 * IP del cliente para el límite de intentos (medido en el despliegue de la Ola 0, ver el PR #1):
 * - Si la petición trae el secreto del middleware de Vercel, la IP real viene en
 *   `x-vercel-forwarded-for` (Vercel descarta lo que mande el cliente).
 * - Si no, `x-real-ip`: lo escribe el borde de Railway y no se puede falsificar. Por Vercel sin
 *   secreto sería la IP de salida de Vercel (compartida); directo a Railway, la del cliente.
 * - En local (sin Railway), la del socket. `trustProxy` sigue en false: nunca X-Forwarded-For.
 */
/** Si la petición pasó por el middleware de Vercel (trae el secreto correcto). */
export function vieneDelProxy(request: FastifyRequest): boolean {
  const secreto = request.server.config.PROXY_SECRETO;
  const enviado = request.headers[CABECERA_PROXY];
  return Boolean(secreto && typeof enviado === "string" && tokensIguales(enviado, secreto));
}

export function ipCliente(request: FastifyRequest): string {
  if (vieneDelProxy(request)) {
    const real = primera(request.headers["x-vercel-forwarded-for"]);
    if (real) return real;
  }
  return primera(request.headers["x-real-ip"]) ?? request.ip;
}

function usuarioDe(body: unknown): string {
  if (typeof body === "object" && body !== null && "usuario" in body) {
    const usuario = body.usuario;
    if (typeof usuario === "string") return usuario.trim().toLowerCase().slice(0, 100);
  }
  return "";
}

/**
 * Límites por ruta. Se activan en cada ruta con `config: { rateLimit: LIMITES.x }`.
 * No son muy bajos porque en Chile muchos celulares comparten IP (CGNAT).
 * Se guardan en memoria: hay una sola instancia del backend.
 */
export const LIMITES = {
  rutLookup: { max: 30, timeWindow: "10 minutes" },
  solicitudes: { max: 10, timeWindow: "1 hour" },
  publicoLectura: { max: 120, timeWindow: "1 minute" },
  completar: { max: 10, timeWindow: "1 hour" },
  /** Llave usuario + IP; corre después de leer el cuerpo (`preHandler`). */
  login: {
    max: 5,
    timeWindow: "1 minute",
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) => `${usuarioDe(request.body)}|${ipCliente(request)}`,
  },
} as const;

export async function registrarLimiteIntentos(app: FastifyInstance) {
  await app.register(rateLimit, { global: false, keyGenerator: ipCliente });
}
