import type { Ejecutor } from "../db/cliente";
import { categorias } from "../db/schema";

/**
 * Categoría por edad de temporada (regla del club, 2026-11-14; básquet y vóley):
 * - Temporada = año calendario en Chile; cambia el 1 de enero.
 * - Edad de temporada = temporada − año de nacimiento. La categoría UN cubre las edades N−1 y N
 *   (`edad_min`, `edad_max` en `categorias`).
 * - U11 F no se calcula (`se_calcula = false`): vale solo si Mony la marcó en la temporada actual
 *   (`jugadores.u11f_temporada`). Al cambiar la temporada, la jugadora vuelve a la calculada.
 * La categoría nunca se guarda: se calcula cada vez con esta función.
 */

export interface CategoriaRegla {
  id: number;
  disciplina: string;
  edad_min: number;
  edad_max: number;
  se_calcula: boolean;
}

export interface JugadorParaCategoria {
  fecha_nacimiento: string | null;
  disciplina: string;
  /** Temporada en que Mony marcó U11 F, o null. */
  u11f_temporada: number | null;
}

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** La fecha de hoy en Chile, `AAAA-MM-DD` (la temporada y la edad cambian a medianoche de acá). */
export function hoyEnChile(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** La temporada vigente: el año calendario en Chile. */
export function temporada(ahora: Date = new Date()): number {
  return Number(hoyEnChile(ahora).slice(0, 4));
}

/**
 * Fecha de nacimiento usable: un día real, desde 1900 y no posterior a hoy en Chile (el mismo
 * criterio que el formulario). Si no lo es, la categoría no se puede calcular y lo que falta es
 * la fecha, no la categoría.
 */
export function fechaNacimientoValida(fecha: string | null, hoy: string = hoyEnChile()): fecha is string {
  if (fecha === null) return false;
  const m = FECHA.exec(fecha);
  if (!m) return false;
  const d = new Date(`${fecha}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) return false;
  return Number(m[1]) >= 1900 && fecha <= hoy;
}

/**
 * La categoría del jugador en la temporada de `ahora`, o null si no tiene (sin fecha válida, o su
 * edad no calza con ninguna categoría de su rama: por ejemplo, vóley no tiene U10).
 */
export function categoriaDelJugador(
  j: JugadorParaCategoria,
  lista: readonly CategoriaRegla[],
  ahora: Date = new Date(),
): number | null {
  const actual = temporada(ahora);
  if (j.u11f_temporada === actual) {
    const marcada = lista.filter((c) => c.disciplina === j.disciplina && !c.se_calcula);
    if (marcada.length === 1 && marcada[0]) return marcada[0].id;
  }
  if (!fechaNacimientoValida(j.fecha_nacimiento, hoyEnChile(ahora))) return null;
  const edad = actual - Number(j.fecha_nacimiento.slice(0, 4));
  const opciones = lista.filter(
    (c) => c.disciplina === j.disciplina && c.se_calcula && c.edad_min <= edad && edad <= c.edad_max,
  );
  return opciones.length === 1 && opciones[0] ? opciones[0].id : null;
}

/** Las categorías de la base (una docena de filas), para `categoriaDelJugador`. */
export function cargarCategorias(db: Ejecutor): Promise<CategoriaRegla[]> {
  return db
    .select({
      id: categorias.id,
      disciplina: categorias.disciplina,
      edad_min: categorias.edad_min,
      edad_max: categorias.edad_max,
      se_calcula: categorias.se_calcula,
    })
    .from(categorias);
}
