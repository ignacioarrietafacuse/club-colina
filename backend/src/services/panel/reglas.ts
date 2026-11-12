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
  disciplina: string;
  categoria_id: number | null;
  numero_camiseta: string | null;
  telefono: string | null;
  foto_id: string | null;
}

export interface CategoriaRegla {
  id: number;
  disciplina: string;
  anio_desde: number;
  anio_hasta: number;
  se_calcula: boolean;
}

/**
 * La categoría que corresponde por año de nacimiento, o null si no se puede calcular (sin fecha,
 * año fuera de la tabla, o más de una opción). Mismo criterio que la consulta de RUT de S2
 * (`services/registro/consulta.ts`): U11 F no se calcula.
 */
export function categoriaCalculada(
  categorias: readonly CategoriaRegla[],
  disciplina: string,
  fechaNacimiento: string | null,
): number | null {
  if (fechaNacimiento === null) return null;
  const anio = Number(fechaNacimiento.slice(0, 4));
  const opciones = categorias.filter(
    (c) => c.disciplina === disciplina && c.se_calcula && c.anio_desde <= anio && anio <= c.anio_hasta,
  );
  return opciones.length === 1 && opciones[0] ? opciones[0].id : null;
}

/**
 * Lo que le falta a la ficha de un jugador, en el orden del contrato, con el mismo criterio que
 * el formulario (S2):
 * - La categoría falta solo si está vacía y no se puede calcular por el año.
 * - El teléfono se exige a un jugador adulto, o de edad desconocida, que no tiene un apoderado
 *   vigente: es su propio contacto.
 * Un campo falta cuando es null (como en el SQL de los filtros).
 */
export function faltantesJugador(
  j: DatosJugador,
  tieneApoderado: boolean,
  categorias: readonly CategoriaRegla[],
  hoy: string = hoyEnChile(),
): FaltanteJugador[] {
  const faltan: FaltanteJugador[] = [];
  if (j.nombre === null) faltan.push("nombre");
  if (j.apellido === null) faltan.push("apellido");
  if (j.fecha_nacimiento === null) faltan.push("fecha_nacimiento");
  if (j.categoria_id === null && categoriaCalculada(categorias, j.disciplina, j.fecha_nacimiento) === null) {
    faltan.push("categoria");
  }
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

/**
 * Lo que impide activar a un jugador (aprobar o activar desde el panel). La categoría no: Mony
 * puede dejarla vacía (la U11 F, por ejemplo, la asigna ella) y corregirla después.
 */
export function requisitosJugador(faltantes: FaltanteJugador[]): FaltanteJugador[] {
  return faltantes.filter((f) => f !== "categoria");
}
