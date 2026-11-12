import {
  apoderadoDetalle,
  apoderadoPatch,
  apoderadosQuery,
  apoderadosResponse,
  cambioEstadoResponse,
  categoriasPanelResponse,
  dashboardResponse,
  entrenadorCrear,
  entrenadorDetalle,
  entrenadoresResponse,
  entrenadorPatch,
  fotoSubidaResponse,
  id as esquemaId,
  jugadorDetalle,
  jugadoresQuery,
  jugadoresResponse,
  jugadorPatch,
  regenerarTokenResponse,
  tipoPersona,
} from "@club-colina/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { noEncontrado } from "../../lib/errores";
import { respuesta, validarEntrada } from "../../lib/validar";
import { activar, cambiarFoto, desactivar, fotoDePersona, regenerarToken } from "../../services/panel/acciones";
import { listarCategorias, resumenDashboard } from "../../services/panel/dashboard";
import {
  crearEntrenador,
  detalleEntrenador,
  editarEntrenador,
  listarEntrenadores,
} from "../../services/panel/entrenadores";
import {
  detalleApoderado,
  detalleJugador,
  editarApoderado,
  editarJugador,
  listarApoderados,
  listarJugadores,
} from "../../services/panel/personas";
import { jsonDeCampo, leerMultipartConFoto } from "./multipart";

const paramsId = z.object({ id: esquemaId });
const paramsTipo = z.object({ tipo: tipoPersona, id: esquemaId });

/** Un id que no es uuid (o un tipo desconocido) es un recurso que no existe: 404, no 400. */
function idDe(params: unknown): string {
  const r = paramsId.safeParse(params);
  if (!r.success) throw noEncontrado();
  return r.data.id;
}
function tipoDe(params: unknown) {
  const r = paramsTipo.safeParse(params);
  if (!r.success) throw noEncontrado();
  return r.data;
}

/** Jugadores, apoderados, entrenadores, sus fotos y credenciales, dashboard y categorías. */
export async function rutasPersonas(app: FastifyInstance) {
  const db = app.db;

  app.get("/dashboard", async () => respuesta(dashboardResponse, await resumenDashboard(db)));
  app.get("/categorias", async () => respuesta(categoriasPanelResponse, await listarCategorias(db)));

  // --- Jugadores -----------------------------------------------------------
  app.get("/jugadores", async (request) => {
    const filtros = validarEntrada(jugadoresQuery, request.query);
    return respuesta(jugadoresResponse, await listarJugadores(db, filtros));
  });
  app.get("/jugadores/:id", async (request) =>
    respuesta(jugadorDetalle, await detalleJugador(db, idDe(request.params))),
  );
  app.patch("/jugadores/:id", async (request) => {
    const id = idDe(request.params);
    await editarJugador(db, id, validarEntrada(jugadorPatch, request.body ?? {}));
    return respuesta(jugadorDetalle, await detalleJugador(db, id));
  });

  // --- Apoderados ----------------------------------------------------------
  app.get("/apoderados", async (request) => {
    const filtros = validarEntrada(apoderadosQuery, request.query);
    return respuesta(apoderadosResponse, await listarApoderados(db, filtros));
  });
  app.get("/apoderados/:id", async (request) =>
    respuesta(apoderadoDetalle, await detalleApoderado(db, idDe(request.params))),
  );
  app.patch("/apoderados/:id", async (request) => {
    const id = idDe(request.params);
    await editarApoderado(db, id, validarEntrada(apoderadoPatch, request.body ?? {}));
    return respuesta(apoderadoDetalle, await detalleApoderado(db, id));
  });

  // --- Entrenadores --------------------------------------------------------
  app.get("/entrenadores", async () => respuesta(entrenadoresResponse, await listarEntrenadores(db)));
  app.get("/entrenadores/:id", async (request) =>
    respuesta(entrenadorDetalle, await detalleEntrenador(db, idDe(request.params))),
  );
  app.post("/entrenadores", async (request, reply) => {
    const { foto, campos } = await leerMultipartConFoto(request);
    const datos = validarEntrada(entrenadorCrear, jsonDeCampo(campos, "datos"));
    const id = await crearEntrenador(db, datos, foto);
    return reply.status(201).send(respuesta(entrenadorDetalle, await detalleEntrenador(db, id)));
  });
  app.patch("/entrenadores/:id", async (request) => {
    const id = idDe(request.params);
    await editarEntrenador(db, id, validarEntrada(entrenadorPatch, request.body ?? {}));
    return respuesta(entrenadorDetalle, await detalleEntrenador(db, id));
  });

  // --- Foto y credencial de cualquier persona ------------------------------
  app.get("/:tipo/:id/foto", async (request, reply) => {
    const { tipo, id } = tipoDe(request.params);
    const foto = await fotoDePersona(db, tipo, id);
    return reply
      .header("content-type", foto.mime)
      .header("cache-control", "private, no-store")
      .send(foto.bytes);
  });
  app.post("/:tipo/:id/foto", async (request) => {
    const { tipo, id } = tipoDe(request.params);
    const { foto } = await leerMultipartConFoto(request);
    await cambiarFoto(db, tipo, id, foto);
    return respuesta(fotoSubidaResponse, { tiene_foto: true });
  });
  // Quién tocó una credencial queda en el log: ids y la acción, nunca el token.
  const registrar = (request: FastifyRequest, accion: string, tipo: string, id: string) =>
    request.log.info({ accion, tipo, persona_id: id, usuario_id: request.usuarioPanel?.id }, "panel: credencial");

  app.post("/:tipo/:id/regenerar-token", async (request) => {
    const { tipo, id } = tipoDe(request.params);
    const credencial_token = await regenerarToken(db, tipo, id);
    registrar(request, "regenerar-token", tipo, id);
    return respuesta(regenerarTokenResponse, { credencial_token });
  });
  app.post("/:tipo/:id/activar", async (request) => {
    const { tipo, id } = tipoDe(request.params);
    const resultado = await activar(db, tipo, id);
    registrar(request, "activar", tipo, id);
    return respuesta(cambioEstadoResponse, resultado);
  });
  app.post("/:tipo/:id/desactivar", async (request) => {
    const { tipo, id } = tipoDe(request.params);
    const resultado = await desactivar(db, tipo, id);
    registrar(request, "desactivar", tipo, id);
    return respuesta(cambioEstadoResponse, resultado);
  });
}
