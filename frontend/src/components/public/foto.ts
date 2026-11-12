import { FOTO_MAX_BYTES } from "@club-colina/shared";

/** Lado mayor de la foto ya comprimida, en píxeles (roadmap: decisiones técnicas). */
export const LADO_MAYOR = 1024;
const CALIDADES = [0.8, 0.7, 0.6, 0.5];

export class ErrorFoto extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorFoto";
  }
}

/** Escala para que el lado mayor quede en `max`, sin agrandar fotos chicas. */
export function calcularDimensiones(ancho: number, alto: number, max = LADO_MAYOR) {
  if (!(ancho > 0) || !(alto > 0)) throw new ErrorFoto("La foto no tiene tamaño.");
  const escala = Math.min(1, max / Math.max(ancho, alto));
  return {
    ancho: Math.max(1, Math.round(ancho * escala)),
    alto: Math.max(1, Math.round(alto * escala)),
  };
}

/** Lo que hace falta del navegador. Se inyecta para poder probarlo sin un navegador. */
export interface Lienzo<F = CanvasImageSource> {
  /** Decodifica la imagen ya girada según su EXIF. */
  decodificar(archivo: Blob): Promise<{ ancho: number; alto: number; fuente: F; liberar(): void }>;
  /** Dibuja en un lienzo del tamaño dado y lo exporta en JPEG. */
  exportar(fuente: F, ancho: number, alto: number, calidad: number): Promise<Blob>;
}

/**
 * Comprime una foto en el navegador antes de subirla: lado mayor de 1024 px, JPEG ~80 %.
 * Volver a dibujarla en un lienzo descarta sus metadatos (EXIF, GPS), así que la ubicación
 * nunca sale del teléfono. Si aun así pesa más que el límite, baja la calidad.
 */
export function comprimirFoto(archivo: Blob): Promise<File> {
  return comprimirFotoCon(archivo, lienzoNavegador());
}

/** Lo mismo que `comprimirFoto`, con el lienzo inyectado (los tests no tienen navegador). */
export async function comprimirFotoCon<F>(archivo: Blob, lienzo: Lienzo<F>): Promise<File> {
  // Algunos gestores de archivos de Android no informan el tipo: se intenta decodificar igual.
  if (archivo.type !== "" && !archivo.type.startsWith("image/")) {
    throw new ErrorFoto("El archivo no es una foto.");
  }
  let imagen;
  try {
    imagen = await lienzo.decodificar(archivo);
  } catch {
    throw new ErrorFoto("No pudimos leer la foto. Prueba con otra o sácala de nuevo.");
  }
  try {
    const { ancho, alto } = calcularDimensiones(imagen.ancho, imagen.alto);
    for (const calidad of CALIDADES) {
      const blob = await lienzo.exportar(imagen.fuente, ancho, alto, calidad);
      if (blob.size <= FOTO_MAX_BYTES) {
        return new File([blob], "foto.jpg", { type: "image/jpeg" });
      }
    }
    throw new ErrorFoto("La foto es demasiado pesada. Prueba con otra.");
  } finally {
    imagen.liberar();
  }
}

function lienzoNavegador(): Lienzo {
  return {
    async decodificar(archivo) {
      // createImageBitmap respeta la orientación EXIF. Si no existe o falla (Safari antiguo,
      // algunos HEIC), se intenta con una <img>, que también la respeta.
      if (typeof createImageBitmap === "function") {
        try {
          const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
          return {
            ancho: bitmap.width,
            alto: bitmap.height,
            fuente: bitmap,
            liberar: () => bitmap.close(),
          };
        } catch {
          // Sigue con la <img>.
        }
      }
      const url = URL.createObjectURL(archivo);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return {
          ancho: img.naturalWidth,
          alto: img.naturalHeight,
          fuente: img,
          liberar: () => URL.revokeObjectURL(url),
        };
      } catch (e) {
        URL.revokeObjectURL(url);
        throw e;
      }
    },
    exportar(fuente, ancho, alto, calidad) {
      const canvas = document.createElement("canvas");
      canvas.width = ancho;
      canvas.height = alto;
      const ctx = canvas.getContext("2d");
      if (!ctx) return Promise.reject(new ErrorFoto("Tu navegador no pudo procesar la foto."));
      // Fondo blanco: un PNG con transparencia quedaría negro en JPEG.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, ancho, alto);
      ctx.drawImage(fuente, 0, 0, ancho, alto);
      return new Promise((resolver, rechazar) => {
        canvas.toBlob(
          (blob) =>
            blob ? resolver(blob) : rechazar(new ErrorFoto("No pudimos procesar la foto.")),
          "image/jpeg",
          calidad,
        );
      });
    },
  };
}
