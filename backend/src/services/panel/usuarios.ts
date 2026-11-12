import { eq } from "drizzle-orm";
import type { Ejecutor } from "../../db/cliente";
import { sesiones, usuarios } from "../../db/schema";
import { hashPassword, normalizarUsuario } from "./sesiones";

export const PASSWORD_MIN = 12;

/** Error de uso del script: su mensaje es propio y se puede mostrar. */
export class ErrorDeUso extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeUso";
  }
}

/**
 * Lo que el script muestra de un error. Solo los mensajes propios: el de cualquier otro error
 * puede traer la consulta y sus parámetros (drizzle los pone en `message` de `DrizzleQueryError`),
 * incluido el hash de la contraseña.
 */
export function mensajeParaMostrar(error: unknown): string {
  return error instanceof ErrorDeUso ? error.message : "Error al escribir en la base (detalle omitido).";
}

function validarPassword(password: string): void {
  if (password.length < PASSWORD_MIN || password.length > 200) {
    throw new ErrorDeUso(`La contraseña debe tener entre ${PASSWORD_MIN} y 200 caracteres.`);
  }
}

function validarUsuario(usuario: string): string {
  const normalizado = normalizarUsuario(usuario);
  if (!/^[a-z0-9._-]{3,100}$/.test(normalizado)) {
    throw new ErrorDeUso(
      "El usuario debe tener entre 3 y 100 caracteres: letras, números, punto, guion o guion bajo.",
    );
  }
  return normalizado;
}

/** Crea un usuario del panel. Falla si ya existe. */
export async function crearUsuario(
  db: Ejecutor,
  datos: { usuario: string; nombre: string; password: string },
): Promise<void> {
  const usuario = validarUsuario(datos.usuario);
  const nombre = datos.nombre.trim();
  if (nombre.length === 0 || nombre.length > 80) throw new ErrorDeUso("Falta el nombre (máximo 80 caracteres).");
  validarPassword(datos.password);
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.usuario, usuario));
  if (existente) throw new ErrorDeUso("Ese usuario ya existe. Para cambiarle la contraseña, usa --cambiar.");
  await db.insert(usuarios).values({ usuario, nombre, password_hash: await hashPassword(datos.password) });
}

/**
 * Le pone una contraseña nueva a un usuario que existe y cierra sus sesiones abiertas. No toca
 * su nombre ni si está activo: un usuario desactivado sigue desactivado, salvo con `reactivar`.
 * Devuelve si quedó activo, para que el script lo diga.
 */
export async function cambiarPassword(
  db: Ejecutor,
  datos: { usuario: string; password: string },
  { reactivar = false }: { reactivar?: boolean } = {},
): Promise<{ activo: boolean }> {
  const usuario = validarUsuario(datos.usuario);
  validarPassword(datos.password);
  const password_hash = await hashPassword(datos.password);
  return db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: usuarios.id, activo: usuarios.activo })
      .from(usuarios)
      .where(eq(usuarios.usuario, usuario))
      .for("update");
    if (!existente) throw new ErrorDeUso("Ese usuario no existe. Para crearlo, quita --cambiar.");
    const activo = reactivar || existente.activo;
    await tx.update(usuarios).set({ password_hash, activo }).where(eq(usuarios.id, existente.id));
    await tx.delete(sesiones).where(eq(sesiones.usuario_id, existente.id));
    return { activo };
  });
}
