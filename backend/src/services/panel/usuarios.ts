import { eq } from "drizzle-orm";
import type { Ejecutor } from "../../db/cliente";
import { sesiones, usuarios } from "../../db/schema";
import { hashPassword, normalizarUsuario } from "./sesiones";

export const PASSWORD_MIN = 12;

/** Valida lo que llega al script; los mensajes nunca repiten la contraseña. */
export function validarDatosUsuario(datos: { usuario: string; nombre: string; password: string }) {
  const usuario = normalizarUsuario(datos.usuario);
  const nombre = datos.nombre.trim();
  if (!/^[a-z0-9._-]{3,100}$/.test(usuario)) {
    throw new Error("El usuario debe tener entre 3 y 100 caracteres: letras, números, punto, guion o guion bajo.");
  }
  if (nombre.length === 0 || nombre.length > 80) throw new Error("Falta el nombre (máximo 80 caracteres).");
  if (datos.password.length < PASSWORD_MIN || datos.password.length > 200) {
    throw new Error(`La contraseña debe tener entre ${PASSWORD_MIN} y 200 caracteres.`);
  }
  return { usuario, nombre, password: datos.password };
}

/**
 * Crea un usuario del panel, o con `cambiar` le pone una contraseña nueva a uno que existe (y lo
 * reactiva). Al cambiar la contraseña se cierran sus sesiones abiertas.
 */
export async function crearOActualizarUsuario(
  db: Ejecutor,
  datos: { usuario: string; nombre: string; password: string },
  { cambiar = false }: { cambiar?: boolean } = {},
): Promise<"creado" | "actualizado"> {
  const { usuario, nombre, password } = validarDatosUsuario(datos);
  const password_hash = await hashPassword(password);
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.usuario, usuario));
  if (existente) {
    if (!cambiar) throw new Error("Ese usuario ya existe. Para cambiarle la contraseña, usa --cambiar.");
    await db.transaction(async (tx) => {
      await tx.update(usuarios).set({ nombre, password_hash, activo: true }).where(eq(usuarios.id, existente.id));
      await tx.delete(sesiones).where(eq(sesiones.usuario_id, existente.id));
    });
    return "actualizado";
  }
  if (cambiar) throw new Error("Ese usuario no existe. Para crearlo, quita --cambiar.");
  await db.insert(usuarios).values({ usuario, nombre, password_hash });
  return "creado";
}
