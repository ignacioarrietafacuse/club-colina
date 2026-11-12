import { hash, verify } from "@node-rs/argon2";
import { COOKIE_SESION, type Usuario } from "@club-colina/shared";
import { and, eq, gt, lte } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Ejecutor } from "../../db/cliente";
import { sesiones, usuarios } from "../../db/schema";
import { ErrorApi } from "../../lib/errores";
import { generarToken, hashToken } from "../../lib/tokens";

declare module "fastify" {
  interface FastifyRequest {
    /** Quien tiene la sesión. Solo existe dentro de /api/panel, después de `exigirSesion`. */
    usuarioPanel?: Usuario;
  }
}

/** Una sesión dura 12 horas desde el login; después hay que volver a entrar. */
export const DURACION_SESION_MS = 12 * 60 * 60 * 1000;

/** Igual que la llave del límite de intentos del login (`LIMITES.login`). */
export function normalizarUsuario(usuario: string): string {
  return usuario.trim().toLowerCase();
}

/** argon2id con los parámetros por defecto de la librería (19 MiB, 2 pasadas). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

// Un hash fijo para comparar cuando el usuario no existe: así el login tarda lo mismo y no
// revela qué usuarios existen. Se calcula al registrar las rutas (`prepararHashFalso`), no en el
// primer login, para que esa primera respuesta no tarde distinto. Si falla, se reintenta.
let hashFalso: Promise<string> | undefined;
function hashParaUsuarioInexistente(): Promise<string> {
  hashFalso ??= hash(generarToken()).catch((error: unknown) => {
    hashFalso = undefined;
    throw error;
  });
  return hashFalso;
}

export async function prepararHashFalso(): Promise<void> {
  await hashParaUsuarioInexistente();
}

/**
 * Verifica usuario y contraseña. Devuelve el usuario solo si existe, está activo y la contraseña
 * coincide; en cualquier otro caso, null (sin decir cuál de las tres falló).
 */
export async function verificarCredenciales(
  db: Ejecutor,
  usuario: string,
  password: string,
): Promise<Usuario | null> {
  const [fila] = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      password_hash: usuarios.password_hash,
      activo: usuarios.activo,
    })
    .from(usuarios)
    .where(eq(usuarios.usuario, normalizarUsuario(usuario)));
  const hashGuardado = fila?.password_hash ?? (await hashParaUsuarioInexistente());
  let coincide = false;
  try {
    coincide = await verify(hashGuardado, password);
  } catch {
    // Un hash dañado en la base se trata como contraseña incorrecta.
    coincide = false;
  }
  if (!fila || !fila.activo || !coincide) return null;
  return { id: fila.id, nombre: fila.nombre };
}

/** Crea una sesión y devuelve el token para la cookie. La base guarda solo su hash. */
export async function crearSesion(db: Ejecutor, usuarioId: string): Promise<{ token: string; expira: Date }> {
  const token = generarToken();
  const expira = new Date(Date.now() + DURACION_SESION_MS);
  // Limpieza de paso: las sesiones vencidas de este usuario ya no sirven.
  await db.delete(sesiones).where(and(eq(sesiones.usuario_id, usuarioId), lte(sesiones.expira_en, new Date())));
  await db.insert(sesiones).values({ id: hashToken(token), usuario_id: usuarioId, expira_en: expira });
  return { token, expira };
}

/** El usuario de una sesión vigente y activa, o null. */
export async function usuarioDeSesion(db: Ejecutor, token: string | undefined): Promise<Usuario | null> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [fila] = await db
    .select({ id: usuarios.id, nombre: usuarios.nombre })
    .from(sesiones)
    .innerJoin(usuarios, eq(usuarios.id, sesiones.usuario_id))
    .where(and(eq(sesiones.id, hashToken(token)), gt(sesiones.expira_en, new Date()), eq(usuarios.activo, true)));
  return fila ?? null;
}

export async function borrarSesion(db: Ejecutor, token: string | undefined): Promise<void> {
  if (typeof token !== "string" || token.length === 0) return;
  await db.delete(sesiones).where(eq(sesiones.id, hashToken(token)));
}

/**
 * `__Host-sesion` exige `Secure`, `Path=/` y nada de `Domain`; si falta algo, el navegador la
 * descarta. `Secure` va también en local: los navegadores la aceptan en http://localhost.
 */
const OPCIONES_COOKIE = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
};

export function ponerCookieSesion(reply: FastifyReply, token: string, expira: Date) {
  reply.setCookie(COOKIE_SESION, token, { ...OPCIONES_COOKIE, expires: expira });
}

export function borrarCookieSesion(reply: FastifyReply) {
  reply.clearCookie(COOKIE_SESION, OPCIONES_COOKIE);
}

/**
 * Hook `onRequest` del panel: sin una sesión vigente, 401. Si la base falla, el error sigue su
 * camino (500) y la petición tampoco pasa: denegar por defecto.
 */
export async function exigirSesion(request: FastifyRequest) {
  const usuario = await usuarioDeSesion(request.server.db, request.cookies[COOKIE_SESION]);
  if (!usuario) throw new ErrorApi(401, "no_autenticado", "Sesión requerida");
  request.usuarioPanel = usuario;
}
