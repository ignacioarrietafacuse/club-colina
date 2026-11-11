import type { CodigoError } from "@club-colina/shared";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

/** Error con respuesta conocida: `{ error: { codigo, mensaje } }`. */
export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: CodigoError,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

export const noEncontrado = () => new ErrorApi(404, "no_encontrado", "No encontrado");

function responder(reply: FastifyReply, status: number, codigo: CodigoError, mensaje: string) {
  return reply.status(status).send({ error: { codigo, mensaje } });
}

function esErrorFastify(error: unknown): error is FastifyError {
  return error instanceof Error && "statusCode" in error && typeof error.statusCode === "number";
}

/**
 * Denegar por defecto: lo que no se reconoce termina en 500 genérico, sin detalles.
 * Los mensajes nunca repiten los valores recibidos.
 */
export function manejarError(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ErrorApi) {
    return responder(reply, error.status, error.codigo, error.message);
  }
  if (error instanceof ZodError) {
    const campos = [...new Set(error.issues.map((i) => i.path.join(".") || "(raíz)"))];
    return responder(reply, 400, "validacion", `Datos inválidos: ${campos.join(", ")}`);
  }
  if (esErrorFastify(error)) {
    const status = error.statusCode ?? 500;
    if (status === 429) {
      return responder(reply, 429, "demasiados_intentos", "Demasiados intentos. Espera un momento.");
    }
    if (status === 413 || error.code.startsWith("FST_REQ_FILE") || error.code.startsWith("FST_FILES")) {
      return responder(reply, 413, "archivo_invalido", "El archivo es demasiado grande o son demasiados.");
    }
    if (status >= 400 && status < 500) {
      return responder(reply, status, "validacion", "Solicitud inválida");
    }
  }
  request.log.error({ err: error }, "error no controlado");
  return responder(reply, 500, "error_interno", "Error interno");
}
