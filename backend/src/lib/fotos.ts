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

// ---------------------------------------------------------------------------
// Metadatos. Las fotos de celular traen EXIF con GPS (a menudo la casa) y fecha; la foto
// de la credencial es pública para quien escanee el QR (Ley 21.719). Se borran en el
// servidor aunque el navegador ya las haya recomprimido. Efecto conocido: al borrar el
// EXIF se pierde la orientación; la compresión del navegador ya la aplica a los píxeles.
// ---------------------------------------------------------------------------

/** JPEG: se conservan APP0 (JFIF) y APP14 (Adobe, color); se borran APP1–APP13, APP15 y comentarios. */
function limpiarJpeg(bytes: Buffer): Buffer | null {
  const partes: Buffer[] = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marcador = bytes[i + 1];
    if (marcador === undefined) return null;
    if (marcador === 0xff) {
      i += 1; // relleno
      continue;
    }
    if (marcador === 0xda) {
      // Inicio de los datos de imagen: de acá en adelante no hay más metadatos.
      partes.push(bytes.subarray(i));
      return Buffer.concat(partes);
    }
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      partes.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > bytes.length) return null;
    const largo = bytes.readUInt16BE(i + 2);
    const fin = i + 2 + largo;
    if (largo < 2 || fin > bytes.length) return null;
    const esMetadato = (marcador >= 0xe1 && marcador <= 0xef && marcador !== 0xee) || marcador === 0xfe;
    if (!esMetadato) partes.push(bytes.subarray(i, fin));
    i = fin;
  }
  return null;
}

const CHUNKS_PNG_METADATOS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function limpiarPng(bytes: Buffer): Buffer | null {
  const partes: Buffer[] = [bytes.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= bytes.length) {
    const largo = bytes.readUInt32BE(i);
    const tipo = bytes.toString("latin1", i + 4, i + 8);
    const fin = i + 12 + largo;
    if (fin > bytes.length) return null;
    if (!CHUNKS_PNG_METADATOS.has(tipo)) partes.push(bytes.subarray(i, fin));
    i = fin;
    if (tipo === "IEND") return Buffer.concat(partes);
  }
  return null;
}

function limpiarWebp(bytes: Buffer): Buffer | null {
  const partes: Buffer[] = [];
  let i = 12;
  while (i + 8 <= bytes.length) {
    const tipo = bytes.toString("latin1", i, i + 4);
    const largo = bytes.readUInt32LE(i + 4);
    const fin = i + 8 + largo + (largo % 2);
    if (i + 8 + largo > bytes.length) return null;
    if (tipo === "VP8X") {
      const chunk = Buffer.from(bytes.subarray(i, Math.min(fin, bytes.length)));
      // Apaga las marcas de EXIF (0x08) y XMP (0x04) porque esos chunks se borran.
      chunk[8] = (chunk[8] ?? 0) & ~0x0c;
      partes.push(chunk);
    } else if (tipo !== "EXIF" && tipo !== "XMP ") {
      partes.push(bytes.subarray(i, Math.min(fin, bytes.length)));
    }
    i = fin;
  }
  const cuerpo = Buffer.concat(partes);
  const cabecera = Buffer.alloc(12);
  cabecera.write("RIFF", 0, "latin1");
  cabecera.writeUInt32LE(cuerpo.length + 4, 4);
  cabecera.write("WEBP", 8, "latin1");
  return Buffer.concat([cabecera, cuerpo]);
}

/** Devuelve la imagen sin metadatos, o null si su estructura no es válida. */
export function quitarMetadatos(bytes: Buffer, mime: MimeFoto): Buffer | null {
  try {
    if (mime === "image/jpeg") return limpiarJpeg(bytes);
    if (mime === "image/png") return limpiarPng(bytes);
    return limpiarWebp(bytes);
  } catch {
    return null;
  }
}

/** Guarda una foto (sin metadatos) y devuelve su id. Rechaza archivos vacíos, grandes o que no son imagen. */
export async function guardarFoto(db: Ejecutor, bytes: Buffer): Promise<string> {
  if (bytes.length === 0 || bytes.length > FOTO_MAX_BYTES) {
    throw new ErrorApi(413, "archivo_invalido", "La foto está vacía o pesa más de 2 MB.");
  }
  const mime = detectarMime(bytes);
  if (mime === null) {
    throw new ErrorApi(400, "archivo_invalido", "La foto debe ser JPEG, PNG o WebP.");
  }
  const limpia = quitarMetadatos(bytes, mime);
  if (limpia === null || limpia.length === 0) {
    throw new ErrorApi(400, "archivo_invalido", "La foto está dañada.");
  }
  const [fila] = await db
    .insert(fotos)
    .values({ mime, bytes: limpia })
    .returning({ id: fotos.id });
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
