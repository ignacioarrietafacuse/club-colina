import { completarCampos, completarResponse } from "@club-colina/shared";
import type { FastifyInstance } from "fastify";
import { ErrorApi, noEncontrado } from "../../lib/errores";
import { LIMITES } from "../../lib/limite-intentos";
import { respuesta, validarEntrada } from "../../lib/validar";
import { existeCompletar, subirFotoCompletar, verCompletar } from "../../services/registro/links";

const invalida = () => new ErrorApi(400, "validacion", "Solicitud inválida");

/** Link personal del segundo apoderado: ver su estado y subir su foto. */
export async function rutasCompletar(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>(
    "/completar/:token",
    { config: { rateLimit: LIMITES.publicoLectura } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      return respuesta(completarResponse, await verCompletar(app.db, request.params.token));
    },
  );

  /** Multipart: archivo `foto` + campo `consentimiento=true`. Responde 204. */
  app.post<{ Params: { token: string } }>(
    "/completar/:token",
    { config: { rateLimit: LIMITES.completar } },
    async (request, reply) => {
      reply.header("cache-control", "no-store");
      // Un link que no existe (o mal formado) no lee el cuerpo: 404 genérico.
      if (!(await existeCompletar(app.db, request.params.token))) throw noEncontrado();
      if (!request.isMultipart()) throw invalida();
      let foto: Buffer | undefined;
      const campos: Record<string, string> = {};
      for await (const parte of request.parts()) {
        if (parte.type === "file") {
          if (parte.fieldname !== "foto" || foto !== undefined) {
            throw new ErrorApi(400, "archivo_invalido", "Se espera un solo archivo `foto`.");
          }
          foto = await parte.toBuffer();
        } else if (typeof parte.value === "string" && !(parte.fieldname in campos)) {
          campos[parte.fieldname] = parte.value;
        } else {
          throw invalida();
        }
      }
      validarEntrada(completarCampos.strict(), campos);
      if (foto === undefined) throw new ErrorApi(400, "archivo_invalido", "Falta la foto.");
      await subirFotoCompletar(app.db, request.params.token, foto);
      return reply.status(204).send();
    },
  );
}
