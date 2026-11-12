import { credencialResponse } from "@club-colina/shared";
import type { FastifyInstance } from "fastify";
import { noEncontrado } from "../../lib/errores";
import { leerFoto } from "../../lib/fotos";
import { LIMITES } from "../../lib/limite-intentos";
import { respuesta } from "../../lib/validar";
import { nombreCompleto } from "../../services/registro/consulta";
import { credencialActiva } from "../../services/registro/links";

/**
 * Verificación del QR. Solo nombre, rol y foto de una persona activa; cualquier otro caso
 * (token inválido, revocado, pendiente) es el mismo 404 genérico.
 */
export async function rutasCredencial(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>(
    "/credencial/:token",
    { config: { rateLimit: LIMITES.publicoLectura } },
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      const c = await credencialActiva(app.db, request.params.token);
      if (!c) throw noEncontrado();
      return respuesta(credencialResponse, { nombre_completo: nombreCompleto(c), rol: c.rol });
    },
  );

  app.get<{ Params: { token: string } }>(
    "/credencial/:token/foto",
    { config: { rateLimit: LIMITES.publicoLectura } },
    async (request, reply) => {
      reply.header("cache-control", "private, no-store");
      const c = await credencialActiva(app.db, request.params.token);
      const foto = c?.foto_id ? await leerFoto(app.db, c.foto_id) : null;
      if (!foto) throw noEncontrado();
      return reply.type(foto.mime).send(foto.bytes);
    },
  );
}
