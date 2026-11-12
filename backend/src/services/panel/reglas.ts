import type { z } from "zod";
import type { faltanteApoderado, faltanteJugador } from "@club-colina/shared";

export type FaltanteJugador = z.infer<typeof faltanteJugador>;
export type FaltanteApoderado = z.infer<typeof faltanteApoderado>;

/** Desde esta edad un jugador puede registrarse solo (jugador adulto). */
export const EDAD_ADULTO = 18;

/** La fecha de hoy en Chile, `AAAA-MM-DD`: la edad cambia a medianoche de acá, no de UTC. */
export function hoyEnChile(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** Edad cumplida a la fecha `hoy` (`AAAA-MM-DD`). Null si no hay fecha o es posterior a hoy. */
export function calcularEdad(fechaNacimiento: string | null, hoy: string = hoyEnChile()): number | null {
  if (!fechaNacimiento) return null;
  const [an, mn, dn] = fechaNacimiento.split("-").map(Number);
  const [ah, mh, dh] = hoy.split("-").map(Number);
  if (an === undefined || mn === undefined || dn === undefined) return null;
  if (ah === undefined || mh === undefined || dh === undefined) return null;
  let edad = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) edad -= 1;
  return edad >= 0 ? edad : null;
}

export function nombreCompleto(nombre: string | null, apellido: string | null): string {
  const texto = [nombre, apellido].filter((p): p is string => Boolean(p && p.trim())).join(" ");
  return texto || "(sin nombre)";
}

export interface DatosJugador {
  nombre: string | null;
  apellido: string | null;
  fecha_nacimiento: string | null;
  categoria_id: number | null;
  numero_camiseta: string | null;
  telefono: string | null;
  foto_id: string | null;
}

/**
 * Lo que le falta a la ficha de un jugador, en el orden del contrato. El teléfono solo se exige
 * a un jugador adulto sin apoderado: es su propio contacto.
 */
export function faltantesJugador(
  j: DatosJugador,
  tieneApoderado: boolean,
  hoy: string = hoyEnChile(),
): FaltanteJugador[] {
  const faltan: FaltanteJugador[] = [];
  if (!j.nombre) faltan.push("nombre");
  if (!j.apellido) faltan.push("apellido");
  if (!j.fecha_nacimiento) faltan.push("fecha_nacimiento");
  if (j.categoria_id === null) faltan.push("categoria");
  if (!j.numero_camiseta) faltan.push("numero_camiseta");
  const edad = calcularEdad(j.fecha_nacimiento, hoy);
  if (!j.telefono && !tieneApoderado && edad !== null && edad >= EDAD_ADULTO) faltan.push("telefono");
  if (!j.foto_id) faltan.push("foto");
  return faltan;
}

export interface DatosApoderado {
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  foto_id: string | null;
}

export function faltantesApoderado(a: DatosApoderado): FaltanteApoderado[] {
  const faltan: FaltanteApoderado[] = [];
  if (!a.nombre) faltan.push("nombre");
  if (!a.apellido) faltan.push("apellido");
  if (!a.telefono) faltan.push("telefono");
  if (!a.foto_id) faltan.push("foto");
  return faltan;
}

/**
 * Lo que impide activar a un jugador (aprobar o activar desde el panel). La categoría no: Mony
 * puede dejarla vacía (la U11 F, por ejemplo, la asigna ella) y corregirla después.
 */
export function requisitosJugador(faltantes: FaltanteJugador[]): FaltanteJugador[] {
  return faltantes.filter((f) => f !== "categoria");
}
