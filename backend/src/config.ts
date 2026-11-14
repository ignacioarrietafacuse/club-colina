import { z } from "zod";

/**
 * Configuración por variables de entorno. Cualquier variable nueva se documenta en
 * .env.example y en el PR que la agrega.
 */
/** Texto opcional: vacío o solo espacios cuenta como ausente. */
const opcional = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : v.trim()));

const esquema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.url(),
  /** URL pública del frontend (va grabada en los QR). Sin barra final. */
  PUBLIC_BASE_URL: z.url().transform((v) => v.replace(/\/+$/, "")),
  /**
   * Orígenes extra aceptados en peticiones que modifican datos, separados por coma
   * (por ejemplo, la URL fija de vercel.app). PUBLIC_BASE_URL siempre se acepta.
   */
  ORIGENES_PERMITIDOS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim().replace(/\/+$/, ""))
        .filter((s) => s.length > 0),
    ),
  /**
   * "si" solo en el servicio de Railway: junto con NODE_ENV=production, permite que el servidor
   * migre una base que no es localhost al arrancar. Sin las dos, la guarda de host lo frena.
   */
  MIGRAR_AL_ARRANCAR: z.enum(["si", "no"]).default("no"),
  /**
   * Secreto compartido con el middleware de Vercel (variable del mismo nombre allá). Con él, el
   * límite de intentos confía en `x-vercel-forwarded-for`. Sin él, usa `x-real-ip`.
   */
  PROXY_SECRETO: z.string().min(32).optional(),
  /**
   * Suscripción del club en Flow (docs/suscripcion-flow.md). `FLOW_MODO` es "sandbox" o
   * "produccion"; con otro valor, vacía o sin las claves de ese modo, el módulo queda "pendiente de
   * configuración" y el resto del sistema sigue igual (por eso acá no se valida: un valor malo no
   * puede impedir que arranque el servidor). Nunca cae a producción por defecto.
   */
  FLOW_MODO: opcional,
  FLOW_SANDBOX_API_KEY: opcional,
  FLOW_SANDBOX_SECRET_KEY: opcional,
  FLOW_PROD_API_KEY: opcional,
  FLOW_PROD_SECRET_KEY: opcional,
});

export type Config = z.infer<typeof esquema>;

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    // Solo los nombres de las variables con problemas; nunca sus valores.
    const variables = [...new Set(resultado.error.issues.map((i) => String(i.path[0])))];
    throw new Error(`Configuración inválida: revisar ${variables.join(", ")}`);
  }
  return resultado.data;
}
