import { CLAVE_MIN } from "@club-colina/shared";
import { ErrorApi } from "@/lib/api";

/** Lo que falta para poder enviar el formulario de cambiar clave, o null si está listo. */
export function problemaClave(actual: string, nueva: string, repetida: string): string | null {
  if (!actual) return "Escribe tu clave actual.";
  if (nueva.length < CLAVE_MIN)
    return `La clave nueva debe tener al menos ${CLAVE_MIN} caracteres.`;
  if (nueva.length > 200) return "La clave nueva puede tener hasta 200 caracteres.";
  if (nueva === actual) return "La clave nueva debe ser distinta de la actual.";
  if (nueva !== repetida) return "Las dos claves nuevas no coinciden.";
  return null;
}

/** Mensaje de un error del servidor al cambiar la clave. */
export function mensajeCambiarClave(error: unknown): string {
  if (error instanceof ErrorApi) {
    if (error.codigo === "credenciales_invalidas") return "La clave actual no es correcta.";
    if (error.codigo === "validacion") {
      return `La clave nueva debe tener al menos ${CLAVE_MIN} caracteres y ser distinta de la actual.`;
    }
    if (error.codigo === "demasiados_intentos") {
      return "Demasiados intentos. Espera unos minutos antes de volver a probar.";
    }
    if (error.codigo === "sin_conexion") return error.message;
  }
  return "No se pudo cambiar la clave. Intenta de nuevo en un momento.";
}
