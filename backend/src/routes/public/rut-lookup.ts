import { rutLookupRequest, rutLookupResponse } from "@club-colina/shared";
import type { FastifyInstance } from "fastify";
import { LIMITES } from "../../lib/limite-intentos";
import { respuesta, validarEntrada } from "../../lib/validar";
import { consultarRut } from "../../services/registro/consulta";

/** POST /api/public/rut-lookup — si el RUT está en la base y qué falta, sin datos ni ids. */
export async function rutasRutLookup(app: FastifyInstance) {
  app.post("/rut-lookup", { config: { rateLimit: LIMITES.rutLookup } }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    const { rut } = validarEntrada(rutLookupRequest, request.body);
    return respuesta(rutLookupResponse, await consultarRut(app.db, rut));
  });
}
