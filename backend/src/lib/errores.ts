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

/** Rutas de los campos con problemas, sin sus valores. */
export function camposConError(error: ZodError): string[] {
  return [...new Set(error.issues.map((i) => i.path.join(".") || "(raíz)"))];
}

export const noEncontrado = () => new ErrorApi(404, "no_encontrado", "No encontrado");

function responder(reply: FastifyReply, status: number, codigo: CodigoError, mensaje: string) {
  return reply.status(status).send({ error: { codigo, mensaje } });
}

function campoTexto(objeto: unknown, clave: string): string | undefined {
  if (typeof objeto !== "object" || objeto === null || !(clave in objeto)) return undefined;
  const valor: unknown = Reflect.get(objeto, clave);
  return typeof valor === "string" ? valor : undefined;
}

/**
 * Lo único que va al log de un error. Nunca el mensaje, los parámetros ni el `detail` de
 * Postgres: drizzle pone en el mensaje la consulta con todos sus parámetros (RUT, teléfonos,
 * tokens, bytes de fotos) y Postgres repite valores en `detail` ("Key (rut)=(...)").
 */
export function resumirError(error: unknown) {
  if (!(error instanceof Error)) {
    return { type: typeof error, message: "(omitido)", stack: "" };
  }
  const causa: unknown = "cause" in error ? error.cause : undefined;
  const origen = typeof causa === "object" && causa !== null ? causa : error;
  return {
    type: error.name,
    message: "(omitido)",
    // Solo las líneas "at ...": la primera línea del stack repite el mensaje.
    stack: (error.stack ?? "")
      .split("\n")
      .filter((linea) => linea.trimStart().startsWith("at "))
      .slice(0, 15)
      .join("\n"),
    codigo: campoTexto(origen, "code") ?? campoTexto(error, "code"),
    restriccion: campoTexto(origen, "constraint_name"),
    tabla: campoTexto(origen, "table_name"),
  };
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
  // Un ZodError suelto no es culpa del cliente (la entrada se valida con validarEntrada,
  // que lanza ErrorApi 400): es una respuesta o un dato interno que no cumple el contrato.
  if (error instanceof ZodError) {
    request.log.error({ err: error, campos: camposConError(error) }, "dato interno fuera de contrato");
    return responder(reply, 500, "error_interno", "Error interno");
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
