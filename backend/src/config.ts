import { z } from "zod";

/**
 * Configuración por variables de entorno. Cualquier variable nueva se documenta en
 * .env.example y en el PR que la agrega.
 */
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
  /** Solo para la verificación del despliegue de la Ola 0. Se borra al terminar. */
  DIAGNOSTICO_TOKEN: z.string().min(32).optional(),
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
