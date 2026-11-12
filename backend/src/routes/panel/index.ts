import type { FastifyInstance } from "fastify";
import { exigirSesion } from "../../services/panel/sesiones";
import { rutasPersonas } from "./personas";
import { rutasSolicitudes } from "./solicitudes";

/**
 * Plugin `panel`, montado en /api/panel. Toda ruta de este plugin exige sesión: sin sesión, con
 * una sesión vencida o de un usuario inactivo, 401; si la verificación falla, 500. En ningún
 * caso la petición llega al handler.
 *
 * El hook va en el plugin entero, así cubre también las rutas que no existen (el 404 propio
 * de abajo corre después del hook): sin sesión no se puede saber qué rutas hay.
 */
export async function rutasPanel(app: FastifyInstance) {
  app.decorateRequest("usuarioPanel", undefined);
  app.addHook("onRequest", exigirSesion);
  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { codigo: "no_encontrado", mensaje: "No encontrado" } }),
  );
  await app.register(rutasPersonas);
  await app.register(rutasSolicitudes);
}
