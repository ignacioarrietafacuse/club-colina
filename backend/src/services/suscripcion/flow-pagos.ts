/**
 * Cliente de la API de Flow (flow.cl) para la suscripción del club al servicio. No tiene relación
 * con Forpay ni con los Flows de WhatsApp. Ver docs/suscripcion-flow.md.
 *
 * Firma (developers.flow.cl/api, "¿Cómo firmar con su SecretKey?"): todos los parámetros menos `s`,
 * ordenados alfabéticamente por nombre, concatenados como nombre+valor, firmados con HMAC-SHA256 y
 * la secretKey del modo activo, en hexadecimal. La firma va en el parámetro `s`: en la consulta si
 * es GET, en el cuerpo `application/x-www-form-urlencoded` si es POST.
 *
 * Nunca se loguean las claves, la firma, los parámetros ni las respuestas de Flow: solo el modo, el
 * servicio, el estado HTTP y el código de error de Flow.
 */
import { createHmac } from "node:crypto";
import type { ModoFlow } from "@club-colina/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../../config";

/** URLs fijas de la API. El modo decide cuál se usa; nunca hay una por defecto. */
export const URL_FLOW: Readonly<Record<ModoFlow, string>> = {
  sandbox: "https://sandbox.flow.cl/api",
  produccion: "https://www.flow.cl/api",
};

/** Lo que Flow tiene para responder, contando todas las llamadas de una misma petición. */
export const PLAZO_FLOW_MS = 8000;

export interface ConfigFlow {
  modo: ModoFlow;
  url: string;
  apiKey: string;
  secretKey: string;
}

/**
 * El único lugar que resuelve modo, URL y claves. Devuelve null si `FLOW_MODO` no es "sandbox" ni
 * "produccion" o si falta alguna de las dos claves de ese modo: el módulo queda "pendiente de
 * configuración". Se llama en cada solicitud, así que un cambio de variable rige al redesplegar.
 */
export function configFlow(config: Config): ConfigFlow | null {
  const claves =
    config.FLOW_MODO === "sandbox"
      ? { modo: "sandbox" as const, apiKey: config.FLOW_SANDBOX_API_KEY, secretKey: config.FLOW_SANDBOX_SECRET_KEY }
      : config.FLOW_MODO === "produccion"
        ? { modo: "produccion" as const, apiKey: config.FLOW_PROD_API_KEY, secretKey: config.FLOW_PROD_SECRET_KEY }
        : null;
  if (!claves?.apiKey || !claves.secretKey) return null;
  return { modo: claves.modo, url: URL_FLOW[claves.modo], apiKey: claves.apiKey, secretKey: claves.secretKey };
}

export type ParametrosFlow = Record<string, string | number>;

/** Cadena que se firma: parámetros (sin `s`) ordenados por nombre, como nombre+valor. */
export function cadenaParaFirmar(parametros: ParametrosFlow): string {
  return Object.keys(parametros)
    .filter((k) => k !== "s")
    .sort()
    .map((k) => `${k}${String(parametros[k])}`)
    .join("");
}

export function firmar(parametros: ParametrosFlow, secretKey: string): string {
  return createHmac("sha256", secretKey).update(cadenaParaFirmar(parametros)).digest("hex");
}

/** Flow respondió con error, no respondió a tiempo o respondió algo que no se entiende. */
export class ErrorFlow extends Error {
  constructor(
    readonly servicio: string,
    /** Estado HTTP de Flow; 0 si no hubo respuesta (red o plazo vencido). */
    readonly status: number,
    /** El `code` del cuerpo de error de Flow, si vino. */
    readonly codigoFlow?: number,
  ) {
    super(`Flow ${servicio}: ${status}`);
    this.name = "ErrorFlow";
  }
}

export type FetchFlow = (url: string, init: RequestInit) => Promise<Response>;

export interface ClienteFlow {
  readonly modo: ModoFlow;
  get(servicio: string, parametros: ParametrosFlow): Promise<unknown>;
  post(servicio: string, parametros: ParametrosFlow): Promise<unknown>;
}

/**
 * Los códigos con que Flow rechaza las claves (vistos en sandbox, 2026-11-14): una apiKey que no
 * conoce es 400 con código 109 ("Invalid ApiKey"); una secretKey que no es la de esa apiKey deja la
 * firma mal y es 400 con código 108 ("Invalid Signature"). Se distinguen por el código, no por el
 * HTTP: el 401 con código 501 es un externalId repetido, no un problema de claves.
 */
export const CLAVES_RECHAZADAS: Readonly<Record<number, "apiKey" | "firma">> = { 109: "apiKey", 108: "firma" };

function codigoDe(cuerpo: unknown): number | undefined {
  if (typeof cuerpo !== "object" || cuerpo === null || !("code" in cuerpo)) return undefined;
  const codigo = Number(cuerpo.code);
  return Number.isFinite(codigo) ? codigo : undefined;
}

/**
 * Un cliente por petición: `senal` es el plazo compartido de esa petición (8 s en total), así una
 * página que hace tres llamadas no espera 24 s.
 */
export function crearClienteFlow(
  cfg: ConfigFlow,
  opciones: { fetch: FetchFlow; log: FastifyBaseLogger; senal: AbortSignal },
): ClienteFlow {
  async function llamar(metodo: "GET" | "POST", servicio: string, parametros: ParametrosFlow): Promise<unknown> {
    const conClave: ParametrosFlow = { ...parametros, apiKey: cfg.apiKey };
    const datos = new URLSearchParams();
    for (const [k, v] of Object.entries(conClave)) datos.set(k, String(v));
    datos.set("s", firmar(conClave, cfg.secretKey));
    const url = metodo === "GET" ? `${cfg.url}/${servicio}?${datos.toString()}` : `${cfg.url}/${servicio}`;
    const inicio = Date.now();
    let status = 0;
    try {
      const res = await opciones.fetch(url, {
        method: metodo,
        signal: opciones.senal,
        headers: metodo === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {},
        ...(metodo === "POST" ? { body: datos.toString() } : {}),
      });
      status = res.status;
      const cuerpo: unknown = await res.json().catch(() => undefined);
      if (!res.ok || cuerpo === undefined) {
        const codigo = codigoDe(cuerpo);
        const motivo = codigo === undefined ? undefined : CLAVES_RECHAZADAS[codigo];
        // Una línea propia y en nivel error: unas claves mal pegadas se notan en la primera llamada.
        if (motivo) {
          opciones.log.error(
            { flow: { modo: cfg.modo, servicio, status, codigo, motivo } },
            "claves rechazadas por Flow: revisar la apiKey y la secretKey de este modo",
          );
        }
        throw new ErrorFlow(servicio, status, codigo);
      }
      return cuerpo;
    } catch (error) {
      if (error instanceof ErrorFlow) throw error;
      // Red caída o plazo vencido: no se repite el error original (podría traer la URL con la firma).
      throw new ErrorFlow(servicio, 0);
    } finally {
      opciones.log.info({ flow: { modo: cfg.modo, servicio, status, ms: Date.now() - inicio } }, "llamada a Flow");
    }
  }
  return {
    modo: cfg.modo,
    get: (servicio, parametros) => llamar("GET", servicio, parametros),
    post: (servicio, parametros) => llamar("POST", servicio, parametros),
  };
}
