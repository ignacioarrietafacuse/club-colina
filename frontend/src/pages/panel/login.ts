import { ErrorApi } from "@/lib/api";

/** Mensaje del login. Nunca dice si lo que falló fue el usuario o la contraseña. */
export function mensajeLogin(error: unknown): string {
  if (error instanceof ErrorApi) {
    if (error.codigo === "credenciales_invalidas" || error.codigo === "validacion") {
      return "Usuario o contraseña incorrectos.";
    }
    if (error.codigo === "demasiados_intentos") {
      return "Demasiados intentos. Espera unos minutos antes de volver a probar.";
    }
    if (error.codigo === "origen_no_permitido") {
      return "Desde esta dirección no se puede ingresar al panel.";
    }
    if (error.codigo === "sin_conexion") return error.message;
  }
  return "No se pudo ingresar. Intenta de nuevo en un momento.";
}
