import {
  API,
  claveFoto,
  FOTOS_MAX_POR_SOLICITUD,
  completarResponse,
  credencialResponse,
  familiaResponse,
  rutLookupResponse,
  solicitudCreadaResponse,
  type SolicitudDatos,
} from "@club-colina/shared";
import { ErrorApi, pedir, pedirSinRespuesta } from "./cliente";

/** Rutas públicas (sin login): formulario, link de familia, segundo apoderado y credencial. */

export function consultarRut(rut: string) {
  return pedir(API.public.rutLookup, rutLookupResponse, { metodo: "POST", json: { rut } });
}

/**
 * Envía el formulario. `fotos` va por clave: la foto de clave `titular` viaja como el archivo
 * `foto_titular`, y `datos` la nombra con `foto: "titular"`. El campo `datos` va primero.
 */
export function crearSolicitud(datos: SolicitudDatos, fotos: Record<string, Blob>) {
  const claves = Object.keys(fotos);
  // Se rechaza antes de subir varios MB que el servidor igual rechazaría.
  if (
    claves.length > FOTOS_MAX_POR_SOLICITUD ||
    !claves.every((c) => claveFoto.safeParse(c).success)
  ) {
    return Promise.reject(
      new ErrorApi(0, "validacion", "Las fotos del formulario no son válidas."),
    );
  }
  const formData = new FormData();
  formData.append("datos", JSON.stringify(datos));
  for (const [clave, archivo] of Object.entries(fotos)) {
    formData.append(`foto_${clave}`, archivo, `${clave}.jpg`);
  }
  return pedir(API.public.solicitudes, solicitudCreadaResponse, { metodo: "POST", formData });
}

export function familia(tokenAcceso: string, signal?: AbortSignal) {
  return pedir(API.public.familia(tokenAcceso), familiaResponse, { signal });
}

export function verCompletar(token: string, signal?: AbortSignal) {
  return pedir(API.public.completar(token), completarResponse, { signal });
}

/** Sube la foto del segundo apoderado. Responde 204. */
export function enviarCompletar(token: string, foto: Blob) {
  const formData = new FormData();
  formData.append("consentimiento", "true");
  formData.append("foto", foto, "foto.jpg");
  return pedirSinRespuesta(API.public.completar(token), { metodo: "POST", formData });
}

export function credencial(credencialToken: string, signal?: AbortSignal) {
  return pedir(API.public.credencial(credencialToken), credencialResponse, { signal });
}

/** URL para un `<img src>`: la foto se sirve solo a través del backend. */
export function urlFotoCredencial(credencialToken: string): string {
  return API.public.credencialFoto(credencialToken);
}
