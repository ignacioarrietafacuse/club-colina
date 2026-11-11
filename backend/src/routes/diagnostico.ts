import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ErrorApi, noEncontrado } from "../lib/errores";
import { borrarFoto, guardarFoto, leerFoto } from "../lib/fotos";
import { LIMITES } from "../lib/limite-intentos";
import { tokensIguales } from "../lib/tokens";

/**
 * Rutas temporales para verificar el despliegue de la Ola 0 (subir, leer y borrar una foto
 * ficticia a través de Vercel). Solo existen mientras DIAGNOSTICO_TOKEN está definido y
 * exigen ese valor en la cabecera `x-diagnostico-token`. Se quitan después de verificar.
 */
export async function rutasDiagnostico(app: FastifyInstance, opciones: { token: string }) {
  const verificar = async (request: FastifyRequest) => {
    const enviado = request.headers["x-diagnostico-token"];
    if (typeof enviado !== "string" || !tokensIguales(enviado, opciones.token)) {
      throw noEncontrado();
    }
  };
  const params = z.object({ id: z.uuid() });
  const config = { rateLimit: LIMITES.diagnostico };

  app.post("/api/diagnostico/foto", { config, onRequest: verificar }, async (request, reply) => {
    const archivo = await request.file();
    if (!archivo || archivo.fieldname !== "foto") {
      throw new ErrorApi(400, "archivo_invalido", "Falta el archivo foto");
    }
    const bytes = await archivo.toBuffer();
    const id = await guardarFoto(app.db, bytes);
    return reply.status(201).send({ id, bytes: bytes.length });
  });

  app.get("/api/diagnostico/foto/:id", { config, onRequest: verificar }, async (request, reply) => {
    const { id } = params.parse(request.params);
    const foto = await leerFoto(app.db, id);
    if (!foto) throw noEncontrado();
    return reply.header("cache-control", "no-store").type(foto.mime).send(foto.bytes);
  });

  app.delete("/api/diagnostico/foto/:id", { config, onRequest: verificar }, async (request, reply) => {
    const { id } = params.parse(request.params);
    if (!(await borrarFoto(app.db, id))) throw noEncontrado();
    return reply.status(204).send();
  });
}
