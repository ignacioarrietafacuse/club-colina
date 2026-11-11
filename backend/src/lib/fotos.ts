import { FOTO_MAX_BYTES, type FOTO_MIMES } from "@club-colina/shared";
import { eq } from "drizzle-orm";
import type { Ejecutor } from "../db/cliente";
import { fotos } from "../db/schema";
import { ErrorApi } from "./errores";

type MimeFoto = (typeof FOTO_MIMES)[number];

/** Tipo real de la imagen según sus primeros bytes; no se confía en la extensión ni en el cliente. */
export function detectarMime(bytes: Buffer): MimeFoto | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** Guarda una foto y devuelve su id. Rechaza archivos vacíos, grandes o que no son imagen. */
export async function guardarFoto(db: Ejecutor, bytes: Buffer): Promise<string> {
  if (bytes.length === 0 || bytes.length > FOTO_MAX_BYTES) {
    throw new ErrorApi(413, "archivo_invalido", "La foto está vacía o pesa más de 2 MB.");
  }
  const mime = detectarMime(bytes);
  if (mime === null) {
    throw new ErrorApi(400, "archivo_invalido", "La foto debe ser JPEG, PNG o WebP.");
  }
  const [fila] = await db.insert(fotos).values({ mime, bytes }).returning({ id: fotos.id });
  if (!fila) throw new Error("No se pudo guardar la foto");
  return fila.id;
}

export async function leerFoto(
  db: Ejecutor,
  id: string,
): Promise<{ mime: string; bytes: Buffer } | null> {
  const [fila] = await db
    .select({ mime: fotos.mime, bytes: fotos.bytes })
    .from(fotos)
    .where(eq(fotos.id, id));
  return fila ?? null;
}

/** Borra una foto. Falla si una ficha todavía la usa (la FK es RESTRICT). */
export async function borrarFoto(db: Ejecutor, id: string): Promise<boolean> {
  const filas = await db.delete(fotos).where(eq(fotos.id, id)).returning({ id: fotos.id });
  return filas.length > 0;
}
