import type { FastifyInstance } from "fastify";

/**
 * Plugin `panel`, montado en /api/panel. Lo construye la sesión S1 de la Ola 1.
 * Toda ruta de este plugin exige sesión: sin sesión o ante un error, 401.
 */
export async function rutasPanel(_app: FastifyInstance) {}
