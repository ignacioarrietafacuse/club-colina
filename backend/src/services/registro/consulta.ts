import type { RutLookupResponse } from "@club-colina/shared";
import { and, asc, eq, isNotNull, not, sql } from "drizzle-orm";
import type { Ejecutor } from "../../db/cliente";
import { apoderados, jugadorApoderado, jugadores } from "../../db/schema";
import { fechaNacimientoValida } from "../../lib/categorias";

type FaltanteApoderado = "nombre" | "apellido" | "telefono" | "foto";
type FaltanteJugador =
  | "nombre"
  | "apellido"
  | "fecha_nacimiento"
  | "numero_camiseta"
  | "telefono"
  | "foto";

export type Apoderado = typeof apoderados.$inferSelect;
export type Jugador = typeof jugadores.$inferSelect;

/** Se muestra cuando un hijo precargado no tiene nombre en la base (el contrato pide texto). */
export const SIN_NOMBRE = "(sin nombre)";

export function primerNombre(nombre: string | null): string {
  return nombre?.trim().split(/\s+/)[0] || SIN_NOMBRE;
}

/** Para comparar nombres: sin mayúsculas, tildes ni espacios de más. */
function normalizarNombre(valor: string): string {
  return valor.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/**
 * Si el primer nombre escrito en el formulario es el de la base (o la base no tiene nombre). Se
 * usa antes de dejar que un formulario tome una ficha cuyo nombre `/familia` mostraría: así el
 * link nunca revela un nombre que quien llenó no escribió.
 */
export function mismoPrimerNombre(base: string | null, enviado: string): boolean {
  if (base === null || base.trim() === "") return true;
  return normalizarNombre(primerNombre(base)) === normalizarNombre(primerNombre(enviado));
}

export function nombreCompleto(p: { nombre: string | null; apellido: string | null }): string {
  return [p.nombre, p.apellido].filter((v) => v).join(" ");
}

/** Fecha de hoy (`AAAA-MM-DD`) en Chile. */
function hoyEnChile(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(ahora);
}

/** Edad cumplida a hoy, a partir de `AAAA-MM-DD`. */
export function edad(fechaNacimiento: string, ahora = new Date()): number {
  const [a, m, d] = fechaNacimiento.split("-").map(Number);
  const [ha, hm, hd] = hoyEnChile(ahora).split("-").map(Number);
  if (!a || !m || !d || !ha || !hm || !hd) return 0;
  const yaCumplio = hm > m || (hm === m && hd >= d);
  return ha - a - (yaCumplio ? 0 : 1);
}

export const EDAD_ADULTO = 18;

/**
 * Jugador adulto según la base: con fecha conocida y 18 años o más. Ante la duda (fecha vacía o
 * errónea en la base) no lo es: la consulta de RUT no revela el nombre de un posible menor, y el
 * adulto sin fecha llena el formulario completo; la fecha que escriba se revisa al enviar.
 */
export function esAdulto(j: Pick<Jugador, "fecha_nacimiento">): boolean {
  return fechaNacimientoValida(j.fecha_nacimiento) && edad(j.fecha_nacimiento) >= EDAD_ADULTO;
}

/** Ya pasó por el formulario o por el panel: no es un precargado que falta completar. */
export function yaRegistrado(p: { estado: string }): boolean {
  return p.estado !== "precargado";
}

export function faltantesApoderado(a: Apoderado): FaltanteApoderado[] {
  const f: FaltanteApoderado[] = [];
  if (a.nombre === null) f.push("nombre");
  if (a.apellido === null) f.push("apellido");
  if (a.telefono === null) f.push("telefono");
  if (a.foto_id === null) f.push("foto");
  return f;
}

/**
 * Lo que falta en la ficha de un jugador. El teléfono solo se pide al jugador adulto. La
 * categoría nunca se pregunta: se calcula con la fecha, así que una fecha vacía o inválida en la
 * base se pide de nuevo.
 */
export function faltantesJugador(
  j: Pick<Jugador, "nombre" | "apellido" | "fecha_nacimiento" | "numero_camiseta" | "telefono" | "foto_id">,
  opciones: { adulto: boolean },
): FaltanteJugador[] {
  const f: FaltanteJugador[] = [];
  if (j.nombre === null) f.push("nombre");
  if (j.apellido === null) f.push("apellido");
  if (!fechaNacimientoValida(j.fecha_nacimiento)) f.push("fecha_nacimiento");
  if (j.numero_camiseta === null) f.push("numero_camiseta");
  if (opciones.adulto && j.telefono === null) f.push("telefono");
  if (j.foto_id === null) f.push("foto");
  return f;
}

/**
 * `bloquear`: toma la fila con `FOR NO KEY UPDATE` (solo dentro de una transacción). La solicitud lo usa
 * en lo que puede copiar a `fichas_previas` y modificar: si Mony cambia la foto o los datos en el
 * panel al mismo tiempo, la solicitud espera y copia lo que dejó Mony, en vez de copiar lo que
 * leyó antes y pisarlo después. `NO KEY` basta: choca con el `FOR UPDATE` y los `UPDATE` del
 * panel, sin frenar los inserts que solo apuntan a la fila (vínculos).
 */
type Bloqueo = { bloquear?: boolean };

/**
 * Hijos del apoderado, en el orden que fija el contrato: sus vínculos, sin filtrar por estado,
 * por `jugador_apoderado.creado_en, jugador_id`. La posición en esta lista es lo único que
 * identifica a un hijo precargado entre la consulta de RUT y la solicitud.
 *
 * Se ocultan los vínculos pendientes que creó una solicitud hacia un hijo que no llegó en esa
 * misma solicitud (un jugador que ya existía, nombrado por RUT): quien nombra el RUT de un menor
 * ajeno no ve su nombre antes de que Mony apruebe el vínculo (decisión de Ignacio, 2026-11-12).
 * Depende de que la solicitud nunca le asigne `solicitud_id` a un jugador que ya existía y se
 * nombró por RUT (`services/registro/solicitud.ts`, con test de punta a punta).
 *
 * Cuando Mony aprueba un vínculo oculto, el hijo aparece en su lugar por `creado_en` y puede
 * correr las posiciones: un formulario abierto recibe 409 `conflicto` porque el nombre no calza.
 */
export async function hijosDeApoderado(db: Ejecutor, apoderadoId: string, opciones: Bloqueo = {}) {
  const consulta = db
    .select({ jugador: jugadores, vinculo: jugadorApoderado })
    .from(jugadorApoderado)
    .innerJoin(jugadores, eq(jugadores.id, jugadorApoderado.jugador_id))
    .where(
      and(
        eq(jugadorApoderado.apoderado_id, apoderadoId),
        // Entre paréntesis: `not()` de drizzle no los agrega.
        not(
          sql`(${eq(jugadorApoderado.estado, "pendiente")} and ${isNotNull(jugadorApoderado.solicitud_id)} and ${jugadores.solicitud_id} is distinct from ${jugadorApoderado.solicitud_id})`,
        ),
      ),
    )
    .orderBy(asc(jugadorApoderado.creado_en), asc(jugadorApoderado.jugador_id));
  const filas = opciones.bloquear ? await consulta.for("no key update", { of: jugadores }) : await consulta;
  return filas.map((f, posicion) => ({ posicion, ...f }));
}

export async function apoderadoPorRut(db: Ejecutor, rut: string, opciones: Bloqueo = {}): Promise<Apoderado | null> {
  const consulta = db.select().from(apoderados).where(eq(apoderados.rut, rut));
  const [a] = opciones.bloquear ? await consulta.for("no key update") : await consulta;
  return a ?? null;
}

export async function jugadorPorRut(db: Ejecutor, rut: string, opciones: Bloqueo = {}): Promise<Jugador | null> {
  const consulta = db.select().from(jugadores).where(eq(jugadores.rut, rut));
  const [j] = opciones.bloquear ? await consulta.for("no key update") : await consulta;
  return j ?? null;
}

/**
 * Consulta de RUT del formulario. Responde solo si está en la base y qué falta; nunca los datos
 * guardados ni ids. Si el RUT es apoderado y jugador a la vez, se trata como apoderado; un
 * jugador que no es adulto con certeza (`esAdulto`) responde `encontrado: false`. La tabla
 * `entrenadores` no se mira: los entrenadores no usan el formulario.
 */
export async function consultarRut(db: Ejecutor, rut: string): Promise<RutLookupResponse> {
  const apoderado = await apoderadoPorRut(db, rut);
  if (apoderado) {
    const registrado = yaRegistrado(apoderado);
    const hijos = await hijosDeApoderado(db, apoderado.id);
    return {
      encontrado: true,
      tipo: "apoderado",
      ya_registrado: registrado,
      faltantes: registrado ? [] : faltantesApoderado(apoderado),
      hijos: hijos.map(({ posicion, jugador }) => ({
        posicion,
        primer_nombre: primerNombre(jugador.nombre),
        ya_registrado: yaRegistrado(jugador),
        faltantes: yaRegistrado(jugador) ? [] : faltantesJugador(jugador, { adulto: false }),
      })),
    };
  }
  const jugador = await jugadorPorRut(db, rut);
  // Un jugador menor (o sin fecha en la base) no usa el formulario por sí mismo: se responde
  // igual que un RUT desconocido, para que la consulta no revele el nombre de un menor
  // (decisión de Ignacio, 2026-11-12). Si su apoderado lo nombra por RUT, el formulario pide
  // todo y el servidor completa solo lo que falta en la ficha.
  if (jugador && esAdulto(jugador)) {
    const registrado = yaRegistrado(jugador);
    return {
      encontrado: true,
      tipo: "jugador",
      primer_nombre: primerNombre(jugador.nombre),
      adulto: true,
      ya_registrado: registrado,
      faltantes: registrado ? [] : faltantesJugador(jugador, { adulto: true }),
    };
  }
  return { encontrado: false };
}
