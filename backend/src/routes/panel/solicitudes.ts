import {
  aprobarRequest,
  id as esquemaId,
  linkResponse,
  rechazarRequest,
  solicitudDetalle,
  solicitudesQuery,
  solicitudesResponse,
} from "@club-colina/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { noEncontrado } from "../../lib/errores";
import { respuesta, validarEntrada } from "../../lib/validar";
import {
  aprobarSolicitud,
  detalleSolicitud,
  listarSolicitudes,
  nuevoLink,
  rechazarSolicitud,
} from "../../services/panel/solicitudes";

const paramsId = z.object({ id: esquemaId });
function idDe(params: unknown): string {
  const r = paramsId.safeParse(params);
  if (!r.success) throw noEncontrado();
  return r.data.id;
}

/** Solicitudes de registro: listado, detalle, aprobar, rechazar y link privado nuevo. */
export async function rutasSolicitudes(app: FastifyInstance) {
  const db = app.db;

  app.get("/solicitudes", async (request) => {
    const filtros = validarEntrada(solicitudesQuery, request.query);
    return respuesta(solicitudesResponse, await listarSolicitudes(db, filtros));
  });
  app.get("/solicitudes/:id", async (request) =>
    respuesta(solicitudDetalle, await detalleSolicitud(db, idDe(request.params))),
  );
  app.post("/solicitudes/:id/aprobar", async (request) => {
    const id = idDe(request.params);
    await aprobarSolicitud(db, id, validarEntrada(aprobarRequest, request.body ?? {}));
    return respuesta(solicitudDetalle, await detalleSolicitud(db, id));
  });
  app.post("/solicitudes/:id/rechazar", async (request) => {
    const id = idDe(request.params);
    await rechazarSolicitud(db, id, validarEntrada(rechazarRequest, request.body ?? {}));
    return respuesta(solicitudDetalle, await detalleSolicitud(db, id));
  });
  // El link es una credencial: se entrega una vez y no se guarda en ningún caché.
  app.post("/solicitudes/:id/link", async (request, reply) => {
    const url = await nuevoLink(db, idDe(request.params), app.config.PUBLIC_BASE_URL);
    return reply.header("cache-control", "no-store").send(respuesta(linkResponse, { url }));
  });
}
