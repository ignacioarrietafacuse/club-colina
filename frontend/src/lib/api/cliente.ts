import { CODIGOS_ERROR, errorRespuesta, type CodigoError } from "@club-colina/shared";
import type { z } from "zod";

/**
 * Códigos que solo nacen en el navegador: `sin_conexion` (la petición no llegó o no volvió) y
 * `respuesta_invalida` (llegó algo que no cumple el contrato de `shared/`).
 */
export type CodigoErrorCliente = CodigoError | "sin_conexion" | "respuesta_invalida";

/** Error de una llamada a la API. `status` es 0 cuando no hubo respuesta HTTP. */
export class ErrorApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: CodigoErrorCliente,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorApi";
  }
}

export function esErrorApi(error: unknown, codigo?: CodigoErrorCliente): error is ErrorApi {
  return error instanceof ErrorApi && (codigo === undefined || error.codigo === codigo);
}

/** Mensaje para mostrar en pantalla. Nunca repite datos: solo el texto del servidor o uno fijo. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.message;
  return "Algo salió mal. Intenta de nuevo.";
}

type Metodo = "GET" | "POST" | "PATCH" | "DELETE";
export type Query = Record<string, string | number | boolean | undefined>;

interface Opciones {
  metodo?: Metodo;
  /** Cuerpo JSON. */
  json?: unknown;
  /** Cuerpo multipart. */
  formData?: FormData;
  query?: Query;
  /** Para cancelar (TanStack Query lo entrega en `queryFn`). */
  signal?: AbortSignal;
}

function armarUrl(ruta: string, query?: Query): string {
  if (!query) return ruta;
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(query)) {
    if (valor !== undefined && valor !== "") params.set(clave, String(valor));
  }
  const texto = params.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}

const codigosConocidos = new Set<string>(CODIGOS_ERROR);
function esCodigoError(valor: string): valor is CodigoError {
  return codigosConocidos.has(valor);
}

async function errorDeRespuesta(res: Response): Promise<ErrorApi> {
  const cuerpo: unknown = await res.json().catch(() => null);
  const leido = errorRespuesta.safeParse(cuerpo);
  if (leido.success && esCodigoError(leido.data.error.codigo)) {
    return new ErrorApi(res.status, leido.data.error.codigo, leido.data.error.mensaje);
  }
  // Sin el formato del contrato: lo cortó otra capa (el borde de Vercel o Railway, el proxy
  // de Vite). El tamaño y el límite de intentos igual se reconocen por el status.
  if (res.status === 413) {
    return new ErrorApi(
      413,
      "archivo_invalido",
      "El archivo es demasiado grande o son demasiados.",
    );
  }
  if (res.status === 429) {
    return new ErrorApi(429, "demasiados_intentos", "Demasiados intentos. Espera un momento.");
  }
  return new ErrorApi(res.status, "error_interno", "El servidor no respondió como se esperaba.");
}

async function enviar(ruta: string, opciones: Opciones): Promise<Response> {
  const cabeceras: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit | undefined;
  if (opciones.json !== undefined) {
    cabeceras["Content-Type"] = "application/json";
    body = JSON.stringify(opciones.json);
  } else if (opciones.formData) {
    // Sin Content-Type: el navegador pone el boundary del multipart.
    body = opciones.formData;
  }
  let res: Response;
  try {
    res = await fetch(armarUrl(ruta, opciones.query), {
      method: opciones.metodo ?? "GET",
      headers: cabeceras,
      body,
      // Mismo origen: Vercel reescribe /api/* al backend, así viaja la cookie de sesión.
      credentials: "same-origin",
      signal: opciones.signal,
    });
  } catch (error) {
    // Cancelar no es un problema de red: se relanza tal cual para que quien canceló lo ignore.
    if (opciones.signal?.aborted) throw error;
    throw new ErrorApi(0, "sin_conexion", "No hay conexión con el servidor. Revisa tu internet.");
  }
  if (!res.ok) throw await errorDeRespuesta(res);
  return res;
}

/**
 * Llama a la API y valida la respuesta con el esquema del contrato. Lo que no calce con el
 * contrato es un error (`respuesta_invalida`), nunca un dato a medias.
 */
export async function pedir<E extends z.ZodType>(
  ruta: string,
  esquema: E,
  opciones: Opciones = {},
): Promise<z.output<E>> {
  const res = await enviar(ruta, opciones);
  const cuerpo: unknown = await res.json().catch(() => undefined);
  const leido = esquema.safeParse(cuerpo);
  if (!leido.success) {
    throw new ErrorApi(res.status, "respuesta_invalida", "El servidor respondió algo inesperado.");
  }
  return leido.data;
}

/**
 * Llama a la API cuando la respuesta no se usa (204, o un cuerpo que la pantalla vuelve a pedir
 * por su lado). Solo importa que haya sido 2xx.
 */
export async function pedirSinRespuesta(ruta: string, opciones: Opciones = {}): Promise<void> {
  const res = await enviar(ruta, opciones);
  await res.body?.cancel();
}

/**
 * Política de reintentos para TanStack Query: un 4xx (sin sesión, no encontrado, validación)
 * no mejora reintentando, y un 401 tiene que cerrar la sesión en pantalla de inmediato.
 * Reintenta hasta 3 veces solo la falta de red y los 5xx.
 */
export function reintentar(fallos: number, error: unknown): boolean {
  if (error instanceof ErrorApi && error.status >= 400 && error.status < 500) return false;
  return fallos < 3;
}
