import type { FastifyInstance } from "fastify";

/**
 * Plugin `public`, montado en /api/public. Lo construye la sesión S2 de la Ola 1.
 * Ninguna respuesta devuelve RUT, teléfono, correo, fechas ni datos de familiares.
 */
export async function rutasPublic(_app: FastifyInstance) {}
