import { isIP } from "node:net";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { COOKIE_SESION } from "@club-colina/shared";
import { hashToken, tokensIguales } from "./tokens";

/** Cabeceras que agrega el middleware de Vercel (frontend/middleware.ts). */
export const CABECERA_PROXY = "x-club-colina-proxy";
export const CABECERA_IP = "x-club-colina-ip";

/**
 * Normaliza una IP para usarla de llave: una IPv4 mapeada (`::ffff:1.2.3.4`) cuenta como IPv4, y
 * una IPv6 se agrupa por su prefijo /64 (un mismo cliente suele tener millones de direcciones).
 */
export function llaveIp(ip: string): string {
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapeada?.[1] && isIP(mapeada[1]) === 4) return mapeada[1];
  if (isIP(ip) !== 6) return ip;
  const [inicio = "", fin = ""] = ip.toLowerCase().split("::");
  const izq = inicio ? inicio.split(":") : [];
  const der = fin ? fin.split(":") : [];
  const grupos = ip.includes("::")
    ? [...izq, ...Array<string>(8 - izq.length - der.length).fill("0"), ...der]
    : izq;
  return `${grupos
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

function primera(valor: string | string[] | undefined): string | undefined {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  const ip = texto?.split(",")[0]?.trim();
  return ip && isIP(ip) ? llaveIp(ip) : undefined;
}

/**
 * IP del cliente para el límite de intentos (medido en el despliegue de la Ola 0, ver el PR #1):
 * - Si la petición trae el secreto del middleware de Vercel, la IP viene en `x-club-colina-ip`:
 *   la escribe el middleware con `ipAddress()` del borde de Vercel, y descarta lo del cliente.
 * - Si no, `x-real-ip`: lo escribe el borde de Railway y no se puede falsificar. Por Vercel sin
 *   secreto sería la IP de salida de Vercel (compartida); directo a Railway, la del cliente.
 * - En local (sin Railway), la del socket. `trustProxy` sigue en false: nunca X-Forwarded-For.
 */
/** Si la petición pasó por el middleware de Vercel (trae el secreto correcto). */
export function vieneDelProxy(request: FastifyRequest): boolean {
  const secreto = request.server.config.PROXY_SECRETO;
  const enviado = request.headers[CABECERA_PROXY];
  return Boolean(secreto && typeof enviado === "string" && tokensIguales(enviado, secreto));
}

export function ipCliente(request: FastifyRequest): string {
  if (vieneDelProxy(request)) {
    const real = primera(request.headers[CABECERA_IP]);
    if (real) return real;
  }
  return primera(request.headers["x-real-ip"]) ?? request.ip;
}

function usuarioDe(body: unknown): string {
  if (typeof body === "object" && body !== null && "usuario" in body) {
    const usuario = body.usuario;
    if (typeof usuario === "string") return usuario.trim().toLowerCase().slice(0, 100);
  }
  return "";
}

/**
 * Límites por ruta. Se activan en cada ruta con `config: { rateLimit: LIMITES.x }`.
 * No son muy bajos porque en Chile muchos celulares comparten IP (CGNAT).
 * Se guardan en memoria: hay una sola instancia del backend.
 */
export const LIMITES = {
  rutLookup: { max: 30, timeWindow: "10 minutes" },
  solicitudes: { max: 10, timeWindow: "1 hour" },
  publicoLectura: { max: 120, timeWindow: "1 minute" },
  completar: { max: 10, timeWindow: "1 hour" },
  /**
   * Login: llave usuario + IP, después de leer el cuerpo (`preHandler`). El trabajo caro (argon2,
   * la base) va en el handler, no en otro preHandler, para que el 429 llegue antes. El tope solo
   * por IP lo agrega S1 (ver roadmap): ojo, la librería marca la petición como contada en el
   * primer límite que corre, así que dos límites en la misma ruta no se pueden sumar sin más.
   */
  login: {
    max: 5,
    timeWindow: "1 minute",
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) => `${usuarioDe(request.body)}|${ipCliente(request)}`,
  },
  /**
   * Cambiar la clave: con sesión (corre después de `exigirSesion`), así que la llave es la sesión,
   * no la IP. Quien tenga una sesión robada prueba a lo más 5 claves actuales cada 15 minutos y no
   * puede abrir otra sin la clave; y gastar esos intentos no le bloquea al dueño, desde su propia
   * sesión, el cambio de clave que lo echaría.
   */
  cambiarClave: {
    max: 5,
    timeWindow: "15 minutes",
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) => {
      const token = request.cookies[COOKIE_SESION];
      return `cambiar-clave|${token ? hashToken(token) : ipCliente(request)}`;
    },
  },
} as const;

export async function registrarLimiteIntentos(app: FastifyInstance) {
  await app.register(rateLimit, { global: false, keyGenerator: ipCliente });
}
