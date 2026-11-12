import { esErrorApi } from "@/lib/api";

/** Status de un error de la API, o null si no fue de la API. */
export function statusDe(e: unknown): number | null {
  return esErrorApi(e) ? e.status : null;
}

/**
 * Texto para la familia según el código del error. Un error desconocido termina en un mensaje
 * genérico: nunca se muestra algo que no sepamos explicar.
 */
export function mensajeError(e: unknown): string {
  if (!esErrorApi(e)) return "Algo salió mal. Intenta de nuevo.";
  switch (e.codigo) {
    case "sin_conexion":
      return "No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.";
    case "demasiados_intentos":
      return "Hiciste demasiados intentos seguidos. Espera unos minutos y vuelve a intentar.";
    case "archivo_invalido":
      return "Una de las fotos no se pudo subir. Prueba con otra foto.";
    case "conflicto":
      return "Los datos cambiaron mientras llenabas el formulario. Vuelve a empezar desde el RUT.";
    case "validacion":
    case "requisitos_incompletos":
      return "Faltan datos o hay alguno con formato incorrecto. Revisa el formulario.";
    case "no_encontrado":
      return "Este link no es válido. Si lo perdiste, pídele uno nuevo al club.";
    default:
      return "Algo salió mal de nuestro lado. Intenta de nuevo en unos minutos.";
  }
}
