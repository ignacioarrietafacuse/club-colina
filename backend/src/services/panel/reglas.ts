import type { z } from "zod";
import type { faltanteApoderado, faltanteJugador } from "@club-colina/shared";
import { fechaNacimientoValida, hoyEnChile } from "../../lib/categorias";

export { hoyEnChile };

export type FaltanteJugador = z.infer<typeof faltanteJugador>;
export type FaltanteApoderado = z.infer<typeof faltanteApoderado>;

/** Desde esta edad un jugador puede registrarse solo (jugador adulto). */
export const EDAD_ADULTO = 18;

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
  disciplina: string;
  numero_camiseta: string | null;
  telefono: string | null;
  foto_id: string | null;
}

/**
 * Lo que le falta a la ficha de un jugador, en el orden del contrato, con el mismo criterio que
 * el formulario (S2):
 * - La categoría nunca falta: se calcula por edad de temporada. Una fecha vacía o inválida falta.
 * - El teléfono se exige a un jugador adulto, o de edad desconocida, que no tiene un apoderado
 *   vigente (activo, ver `tieneApoderadoVigente`): es su propio contacto.
 * Un campo falta cuando es null (como en el SQL de los filtros).
 */
export function faltantesJugador(
  j: DatosJugador,
  tieneApoderado: boolean,
  hoy: string = hoyEnChile(),
): FaltanteJugador[] {
  const faltan: FaltanteJugador[] = [];
  if (j.nombre === null) faltan.push("nombre");
  if (j.apellido === null) faltan.push("apellido");
  if (!fechaNacimientoValida(j.fecha_nacimiento, hoy)) faltan.push("fecha_nacimiento");
  if (j.numero_camiseta === null) faltan.push("numero_camiseta");
  const edad = calcularEdad(j.fecha_nacimiento, hoy);
  if (j.telefono === null && !tieneApoderado && (edad === null || edad >= EDAD_ADULTO)) faltan.push("telefono");
  if (j.foto_id === null) faltan.push("foto");
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
  if (a.nombre === null) faltan.push("nombre");
  if (a.apellido === null) faltan.push("apellido");
  if (a.telefono === null) faltan.push("telefono");
  if (a.foto_id === null) faltan.push("foto");
  return faltan;
}
