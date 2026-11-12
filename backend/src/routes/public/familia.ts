import { familiaResponse } from "@club-colina/shared";
import type { FastifyInstance } from "fastify";
import { LIMITES } from "../../lib/limite-intentos";
import { respuesta } from "../../lib/validar";
import { verFamilia } from "../../services/registro/links";

/** GET /api/public/familia/:token — el link privado de quien llenó el formulario. */
export async function rutasFamilia(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>(
    "/familia/:token",
    { config: { rateLimit: LIMITES.publicoLectura } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return respuesta(familiaResponse, await verFamilia(app.db, request.params.token));
    },
  );
}
