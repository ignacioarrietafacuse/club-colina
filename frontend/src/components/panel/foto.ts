import { FOTO_MAX_BYTES, FOTO_MIMES } from "@club-colina/shared";

/** Lado mayor y calidad de las fotos que se suben (roadmap: decisiones técnicas). */
export const LADO_MAYOR = 1024;
const CALIDAD_JPEG = 0.8;

export class ErrorFoto extends Error {}

/** Medidas finales manteniendo la proporción, sin agrandar. */
export function medidasReducidas(ancho: number, alto: number, lado = LADO_MAYOR) {
  const escala = Math.min(1, lado / Math.max(ancho, alto));
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

export function esTipoFotoAceptado(tipo: string): boolean {
  return FOTO_MIMES.some((m) => m === tipo);
}

/**
 * Comprime en el navegador: lado mayor 1024 px, JPEG ~80 %. Al redibujar en un canvas se
 * pierden también los metadatos (el backend igual los borra).
 */
export async function comprimirFoto(archivo: File): Promise<Blob> {
  if (!esTipoFotoAceptado(archivo.type)) {
    throw new ErrorFoto("La foto tiene que ser JPG, PNG o WebP.");
  }
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    throw new ErrorFoto("No se pudo leer la foto.");
  }
  const { ancho, alto } = medidasReducidas(imagen.width, imagen.height);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErrorFoto("No se pudo procesar la foto.");
  // JPEG no tiene transparencia: un PNG recortado queda sobre blanco, no sobre negro.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, ancho, alto);
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();
  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, "image/jpeg", CALIDAD_JPEG),
  );
  if (!blob) throw new ErrorFoto("No se pudo procesar la foto.");
  if (blob.size > FOTO_MAX_BYTES) throw new ErrorFoto("La foto es demasiado grande.");
  return blob;
}
