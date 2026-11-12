import type { FastifyInstance } from "fastify";
import { ErrorApi } from "../../lib/errores";

/**
 * Plugin `panel`, montado en /api/panel. Lo construye la sesión S1 de la Ola 1.
 * Toda ruta de este plugin exige sesión: sin sesión o ante un error, 401.
 *
 * Denegar por defecto: mientras S1 no implemente la verificación de sesión, todo
 * /api/panel/* (incluidas las rutas que no existen) responde 401. S1 reemplaza este
 * hook por el que valida la cookie, sin dejar ninguna ruta afuera.
 */
export async function rutasPanel(app: FastifyInstance) {
  app.addHook("onRequest", async () => {
    throw new ErrorApi(401, "no_autenticado", "Sesión requerida");
  });
  // Un 404 propio del plugin, para que el hook también cubra las rutas que no existen.
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { codigo: "no_encontrado", mensaje: "No encontrado" } }),
  );
}
