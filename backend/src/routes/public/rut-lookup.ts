import { rutLookupRequest, rutLookupResponse } from "@club-colina/shared";
import type { FastifyInstance } from "fastify";
import { LIMITES } from "../../lib/limite-intentos";
import { respuesta, validarEntrada } from "../../lib/validar";
import { consultarRut } from "../../services/registro/consulta";

/** POST /api/public/rut-lookup — si el RUT está en la base y qué falta, sin datos ni ids. */
export async function rutasRutLookup(app: FastifyInstance) {
  app.post("/rut-lookup", { config: { rateLimit: LIMITES.rutLookup } }, async (request, reply) => {
    const { rut } = validarEntrada(rutLookupRequest, request.body);
    reply.header("cache-control", "no-store");
    return respuesta(rutLookupResponse, await consultarRut(app.db, rut));
  });
}
