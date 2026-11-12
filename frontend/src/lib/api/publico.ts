import {
  API,
  categoriasPublicasResponse,
  completarResponse,
  credencialResponse,
  familiaResponse,
  rutLookupResponse,
  solicitudCreadaResponse,
  type SolicitudDatos,
} from "@club-colina/shared";
import { pedir, pedirSinRespuesta } from "./cliente";

/** Rutas públicas (sin login): formulario, link de familia, segundo apoderado y credencial. */

export function consultarRut(rut: string) {
  return pedir(API.public.rutLookup, rutLookupResponse, { metodo: "POST", json: { rut } });
}

export function categoriasPublicas() {
  return pedir(API.public.categorias, categoriasPublicasResponse);
}

/**
 * Envía el formulario. `fotos` va por clave: la foto de clave `titular` viaja como el archivo
 * `foto_titular`, y `datos` la nombra con `foto: "titular"`. El campo `datos` va primero.
 */
export function crearSolicitud(datos: SolicitudDatos, fotos: Record<string, Blob>) {
  const formData = new FormData();
  formData.append("datos", JSON.stringify(datos));
  for (const [clave, archivo] of Object.entries(fotos)) {
    formData.append(`foto_${clave}`, archivo, `${clave}.jpg`);
  }
  return pedir(API.public.solicitudes, solicitudCreadaResponse, { metodo: "POST", formData });
}

export function familia(tokenAcceso: string) {
  return pedir(API.public.familia(tokenAcceso), familiaResponse);
}

export function verCompletar(token: string) {
  return pedir(API.public.completar(token), completarResponse);
}

/** Sube la foto del segundo apoderado. Responde 204. */
export function enviarCompletar(token: string, foto: Blob) {
  const formData = new FormData();
  formData.append("consentimiento", "true");
  formData.append("foto", foto, "foto.jpg");
  return pedirSinRespuesta(API.public.completar(token), { metodo: "POST", formData });
}

export function credencial(credencialToken: string) {
  return pedir(API.public.credencial(credencialToken), credencialResponse);
}

/** URL para un `<img src>`: la foto se sirve solo a través del backend. */
export function urlFotoCredencial(credencialToken: string): string {
  return API.public.credencialFoto(credencialToken);
}
