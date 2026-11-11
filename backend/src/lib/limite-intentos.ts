import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

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
  login: { max: 5, timeWindow: "1 minute" },
  diagnostico: { max: 10, timeWindow: "1 minute" },
} as const;

export async function registrarLimiteIntentos(app: FastifyInstance) {
  await app.register(rateLimit, {
    global: false,
    // La IP sale de request.ip, que depende de trustProxy (ver app.ts).
    keyGenerator: (request) => request.ip,
  });
}
