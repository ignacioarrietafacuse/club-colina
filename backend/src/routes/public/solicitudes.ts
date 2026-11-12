import { solicitudCreadaResponse, solicitudDatos } from "@club-colina/shared";
import type { FastifyInstance } from "fastify";
import { ErrorApi } from "../../lib/errores";
import { LIMITES } from "../../lib/limite-intentos";
import { respuesta, validarEntrada } from "../../lib/validar";
import { claveDeArchivo, crearSolicitud } from "../../services/registro/solicitud";

const invalida = () => new ErrorApi(400, "validacion", "Solicitud inválida");

/**
 * POST /api/public/solicitudes — multipart: campo `datos` (JSON) y archivos `foto_<clave>`.
 * Responde 201 con el link privado y los de los otros apoderados: es la única vez que se
 * entregan (la base guarda solo su hash).
 */
export async function rutasSolicitudes(app: FastifyInstance) {
  app.post("/solicitudes", { config: { rateLimit: LIMITES.solicitudes } }, async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!request.isMultipart()) throw invalida();

    let texto: string | undefined;
    const archivos = new Map<string, Buffer>();
    for await (const parte of request.parts()) {
      if (parte.type === "file") {
        const clave = claveDeArchivo(parte.fieldname);
        if (clave === null || archivos.has(clave)) {
          throw new ErrorApi(400, "archivo_invalido", "Las fotos no calzan con los datos enviados.");
        }
        // Si pasa de FOTO_MAX_BYTES, toBuffer lanza el error de Fastify y responde 413.
        archivos.set(clave, await parte.toBuffer());
      } else if (parte.fieldname === "datos" && texto === undefined && typeof parte.value === "string") {
        texto = parte.value;
      } else {
        throw invalida();
      }
    }
    if (texto === undefined) throw invalida();

    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw invalida();
    }
    const datos = validarEntrada(solicitudDatos, json);
    const creada = await crearSolicitud(app.db, datos, archivos);
    return reply.status(201).send(respuesta(solicitudCreadaResponse, creada));
  });
}
