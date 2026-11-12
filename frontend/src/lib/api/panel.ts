import {
  API,
  apoderadoDetalle,
  apoderadosResponse,
  cambioEstadoResponse,
  categoriasPanelResponse,
  dashboardResponse,
  entrenadorDetalle,
  entrenadoresResponse,
  fotoSubidaResponse,
  jugadorDetalle,
  jugadoresResponse,
  linkResponse,
  regenerarTokenResponse,
  solicitudDetalle,
  solicitudesResponse,
  type apoderadosQuery,
  type AprobarRequest,
  type ApoderadoPatch,
  type EntrenadorCrear,
  type EntrenadorPatch,
  type jugadoresQuery,
  type JugadorPatch,
  type RechazarRequest,
  type solicitudesQuery,
  type TIPOS_PERSONA,
} from "@club-colina/shared";
import type { z } from "zod";
import { pedir, pedirSinRespuesta } from "./cliente";

/** Rutas del panel (con sesión). Un 401 llega como `ErrorApi` con status 401. */

export type TipoPersona = (typeof TIPOS_PERSONA)[number];
/** Filtros ya tipados (booleanos y números); el cliente los pasa a texto en la URL. */
export type FiltrosJugadores = z.output<typeof jugadoresQuery>;
export type FiltrosApoderados = z.output<typeof apoderadosQuery>;
export type FiltrosSolicitudes = z.output<typeof solicitudesQuery>;

export function dashboard(signal?: AbortSignal) {
  return pedir(API.panel.dashboard, dashboardResponse, { signal });
}

// --- Solicitudes ------------------------------------------------------------

export function solicitudes(filtros: FiltrosSolicitudes = {}, signal?: AbortSignal) {
  return pedir(API.panel.solicitudes, solicitudesResponse, { query: filtros, signal });
}

export function solicitud(id: string, signal?: AbortSignal) {
  return pedir(API.panel.solicitud(id), solicitudDetalle, { signal });
}

/** Aprobación parcial: lo que no se envía queda pendiente. Devuelve el detalle actualizado. */
export function aprobarSolicitud(id: string, datos: AprobarRequest) {
  return pedir(API.panel.aprobar(id), solicitudDetalle, { metodo: "POST", json: datos });
}

/** Sin `personas` se rechaza todo lo pendiente. La pantalla vuelve a pedir el detalle. */
export function rechazarSolicitud(id: string, datos: RechazarRequest = {}) {
  return pedirSinRespuesta(API.panel.rechazar(id), { metodo: "POST", json: datos });
}

/** Genera un link privado nuevo y anula el anterior. */
export function nuevoLinkSolicitud(id: string) {
  return pedir(API.panel.link(id), linkResponse, { metodo: "POST" });
}

// --- Jugadores --------------------------------------------------------------

export function jugadores(filtros: FiltrosJugadores = {}, signal?: AbortSignal) {
  return pedir(API.panel.jugadores, jugadoresResponse, { query: filtros, signal });
}

export function jugador(id: string, signal?: AbortSignal) {
  return pedir(API.panel.jugador(id), jugadorDetalle, { signal });
}

export function editarJugador(id: string, datos: JugadorPatch) {
  return pedirSinRespuesta(API.panel.jugador(id), { metodo: "PATCH", json: datos });
}

/** Quita la marca «ya no está en el club» (Mony confirma que sigue). Devuelve la ficha. */
export function quitarMarcaRetiro(id: string) {
  return pedir(`${API.panel.jugador(id)}/marca-retiro`, jugadorDetalle, { metodo: "DELETE" });
}
// --- Apoderados -------------------------------------------------------------

export function apoderados(filtros: FiltrosApoderados = {}, signal?: AbortSignal) {
  return pedir(API.panel.apoderados, apoderadosResponse, { query: filtros, signal });
}

export function apoderado(id: string, signal?: AbortSignal) {
  return pedir(API.panel.apoderado(id), apoderadoDetalle, { signal });
}

export function editarApoderado(id: string, datos: ApoderadoPatch) {
  return pedirSinRespuesta(API.panel.apoderado(id), { metodo: "PATCH", json: datos });
}

// --- Entrenadores -----------------------------------------------------------

export function entrenadores(signal?: AbortSignal) {
  return pedir(API.panel.entrenadores, entrenadoresResponse, { signal });
}

export function entrenador(id: string, signal?: AbortSignal) {
  return pedir(API.panel.entrenador(id), entrenadorDetalle, { signal });
}

/** Multipart: `datos` (JSON) primero y la foto obligatoria después. */
export function crearEntrenador(datos: EntrenadorCrear, foto: Blob) {
  const formData = new FormData();
  formData.append("datos", JSON.stringify(datos));
  formData.append("foto", foto, "foto.jpg");
  return pedirSinRespuesta(API.panel.entrenadores, { metodo: "POST", formData });
}

export function editarEntrenador(id: string, datos: EntrenadorPatch) {
  return pedirSinRespuesta(API.panel.entrenador(id), { metodo: "PATCH", json: datos });
}

// --- Cualquier persona ------------------------------------------------------

/** URL para un `<img src>`: la cookie de sesión viaja sola porque es el mismo origen. */
export function urlFoto(tipo: TipoPersona, id: string): string {
  return API.panel.foto(tipo, id);
}

export function subirFoto(tipo: TipoPersona, id: string, foto: Blob) {
  const formData = new FormData();
  formData.append("foto", foto, "foto.jpg");
  return pedir(API.panel.foto(tipo, id), fotoSubidaResponse, { metodo: "POST", formData });
}

export function regenerarToken(tipo: TipoPersona, id: string) {
  return pedir(API.panel.regenerarToken(tipo, id), regenerarTokenResponse, { metodo: "POST" });
}

export function activar(tipo: TipoPersona, id: string) {
  return pedir(API.panel.activar(tipo, id), cambioEstadoResponse, { metodo: "POST" });
}

export function desactivar(tipo: TipoPersona, id: string) {
  return pedir(API.panel.desactivar(tipo, id), cambioEstadoResponse, { metodo: "POST" });
}

export function categorias(signal?: AbortSignal) {
  return pedir(API.panel.categorias, categoriasPanelResponse, { signal });
}
