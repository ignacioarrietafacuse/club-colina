import type { FastifyInstance } from "fastify";

/**
 * Plugin `auth`, montado en /api/auth. Lo construye la sesión S1 de la Ola 1:
 * POST /login, POST /logout y GET /me, según el contrato de shared/.
 */
export async function rutasAuth(_app: FastifyInstance) {}
