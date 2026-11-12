/**
 * Solicitudes de registro en el panel: listado, detalle, aprobar, rechazar y link nuevo.
 *
 * Quién se decide desde una solicitud `s` (decisión de Ignacio, 2026-11-12: "solo desde la
 * propia"). Lo escribe S2; ver CLAUDE.md.
 * - Personas propias, que se aprueban o rechazan desde `s`:
 *   - las que tienen `solicitud_id = s`;
 *   - el segundo apoderado que agregó `s` (su `solicitud_id` es una solicitud
 *     `segundo_apoderado` con `solicitud_origen_id = s`);
 *   - una persona que ya existía, que `s` dejó `pendiente` sin asignarle solicitud (un hijo
 *     precargado sin apoderado, nombrado por RUT): no tiene otra solicitud desde donde decidirla.
 * - Vínculos de `s`: los que creó (`jugador_apoderado.solicitud_id = s`). En una solicitud de
 *   segundo apoderado, también los de su apoderado que creó la solicitud de origen.
 * - Una persona de otra solicitud que aparece en un vínculo de `s` se muestra, pero desde `s`
 *   solo se decide el vínculo. Un vínculo se aprueba solo si el jugador y el apoderado quedan
 *   activos.
 */
import {
  DISCIPLINAS,
  ESTADOS_PERSONA,
  METODOS_PAGO,
  type aprobarRequest,
  type rechazarRequest,
  type solicitudDetalle,
  type solicitudResumen,
  type solicitudesQuery,
} from "@club-colina/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Ejecutor } from "../../db/cliente";
import {
  apoderados,
  fichasPrevias,
  fotos,
  jugadorApoderado,
  jugadores,
  solicitudesRegistro,
} from "../../db/schema";
import { CANDADO_SOLICITUDES } from "../../lib/candados";
import { ErrorApi, noEncontrado } from "../../lib/errores";
import { borrarFoto } from "../../lib/fotos";
import { generarToken, hashToken } from "../../lib/tokens";
import { incompleto, MENSAJE_MARCADO } from "./acciones";
import { conRestricciones } from "./errores-db";
import { cargarCategorias, detalleApoderado, detalleJugador, tieneApoderadoVigente, verificarCategoria } from "./personas";
import { faltantesApoderado, faltantesJugador, nombreCompleto, requisitosJugador } from "./reglas";

type SolicitudResumen = z.input<typeof solicitudResumen>;
type SolicitudDetalle = z.input<typeof solicitudDetalle>;
type Fila = typeof solicitudesRegistro.$inferSelect;

const fechaHora = (d: Date | null) => (d ? d.toISOString() : null);
const conflicto = (mensaje: string) => new ErrorApi(409, "conflicto", mensaje);
const fueraDeLaSolicitud = () =>
  conflicto("Esa persona o vínculo no está pendiente en esta solicitud: se decide desde su propia solicitud");

/**
 * El mismo candado que toma S2 al recibir una solicitud: aprobar y rechazar restauran o borran
 * `fichas_previas`, y una solicitud en paralelo no puede copiar una ficha a medio restaurar. Va
 * primero en la transacción, antes de bloquear filas, en el mismo orden que S2.
 */
async function tomarCandado(tx: Ejecutor): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${CANDADO_SOLICITUDES})`);
}

async function filaSolicitud(db: Ejecutor, id: string, bloquear = false): Promise<Fila> {
  const consulta = db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, id));
  const [fila] = bloquear ? await consulta.for("update") : await consulta;
  if (!fila) throw noEncontrado();
  return fila;
}

const unicos = (ids: Iterable<string>) => [...new Set(ids)];

// ---------------------------------------------------------------------------
// Quién es de la solicitud
// ---------------------------------------------------------------------------

interface Miembros {
  vinculos: Array<{ jugador_id: string; apoderado_id: string; paga_mensualidad: boolean; estado: "pendiente" | "activo" }>;
  propiosJ: string[];
  propiosA: string[];
  /** Los que se muestran en el detalle: propios, los de sus vínculos, el titular y los marcados. */
  visiblesJ: string[];
  visiblesA: string[];
}

/** La condición de "vínculo de esta solicitud" (ver el comentario del archivo). */
async function condicionVinculos(db: Ejecutor, s: Fila): Promise<SQL | undefined> {
  const deEsta = eq(jugadorApoderado.solicitud_id, s.id);
  if (s.tipo !== "segundo_apoderado" || !s.solicitud_origen_id) return deEsta;
  const suyos = await db.select({ id: apoderados.id }).from(apoderados).where(eq(apoderados.solicitud_id, s.id));
  if (suyos.length === 0) return deEsta;
  return or(
    deEsta,
    and(
      eq(jugadorApoderado.solicitud_id, s.solicitud_origen_id),
      inArray(
        jugadorApoderado.apoderado_id,
        suyos.map((a) => a.id),
      ),
    ),
  );
}

async function miembros(db: Ejecutor, s: Fila): Promise<Miembros> {
  const vinculos = await db
    .select({
      jugador_id: jugadorApoderado.jugador_id,
      apoderado_id: jugadorApoderado.apoderado_id,
      paga_mensualidad: jugadorApoderado.paga_mensualidad,
      estado: jugadorApoderado.estado,
    })
    .from(jugadorApoderado)
    .where(await condicionVinculos(db, s))
    .orderBy(asc(jugadorApoderado.creado_en), asc(jugadorApoderado.jugador_id), asc(jugadorApoderado.apoderado_id));
  const enVinculosJ = unicos(vinculos.map((v) => v.jugador_id));
  const enVinculosA = unicos(vinculos.map((v) => v.apoderado_id));

  // Una persona que ya existía y que s dejó pendiente sin asignarle solicitud es propia de s solo
  // si s escribió su ficha previa: sin eso no se sabe qué solicitud la modificó (denegar por
  // defecto), y otra solicitud que la nombre después solo crea su vínculo.
  const copiasJ = db
    .select({ id: fichasPrevias.jugador_id })
    .from(fichasPrevias)
    .where(and(eq(fichasPrevias.solicitud_id, s.id), isNotNull(fichasPrevias.jugador_id)));
  const copiasA = db
    .select({ id: fichasPrevias.apoderado_id })
    .from(fichasPrevias)
    .where(and(eq(fichasPrevias.solicitud_id, s.id), isNotNull(fichasPrevias.apoderado_id)));
  const segundas = db
    .select({ id: solicitudesRegistro.id })
    .from(solicitudesRegistro)
    .where(eq(solicitudesRegistro.solicitud_origen_id, s.id));
  const propiosJ = await db
    .select({ id: jugadores.id })
    .from(jugadores)
    .where(
      or(
        eq(jugadores.solicitud_id, s.id),
        enVinculosJ.length > 0
          ? and(
              isNull(jugadores.solicitud_id),
              eq(jugadores.estado, "pendiente"),
              inArray(jugadores.id, enVinculosJ),
              inArray(jugadores.id, copiasJ),
            )
          : undefined,
      ),
    );
  const propiosA = await db
    .select({ id: apoderados.id })
    .from(apoderados)
    .where(
      or(
        eq(apoderados.solicitud_id, s.id),
        inArray(apoderados.solicitud_id, segundas),
        enVinculosA.length > 0
          ? and(
              isNull(apoderados.solicitud_id),
              eq(apoderados.estado, "pendiente"),
              inArray(apoderados.id, enVinculosA),
              inArray(apoderados.id, copiasA),
            )
          : undefined,
      ),
    );

  const pJ = propiosJ.map((f) => f.id);
  const pA = propiosA.map((f) => f.id);
  const titularA = s.titular_apoderado_id ? [s.titular_apoderado_id] : [];
  const titularJ = s.titular_jugador_id ? [s.titular_jugador_id] : [];
  const visiblesJ = unicos([...titularJ, ...pJ, ...enVinculosJ]);
  const marcados = await marcadosYaNoEsta(db, s.titular_apoderado_id, visiblesJ);
  return {
    vinculos,
    propiosJ: pJ,
    propiosA: pA,
    visiblesJ: [...visiblesJ, ...marcados],
    visiblesA: unicos([...titularA, ...pA, ...enVinculosA]),
  };
}

/**
 * Hijos del titular marcados "ya no está en el club" que Mony todavía no dio de baja, para que el
 * aviso `hijo_marcado_ya_no_esta` apunte a una ficha. S2 no les asigna `solicitud_id`, así que
 * se buscan por su vínculo con el titular. Solo se muestran: no se deciden por la solicitud.
 */
async function marcadosYaNoEsta(db: Ejecutor, titularApoderadoId: string | null, excluir: string[]): Promise<string[]> {
  if (!titularApoderadoId) return [];
  const filas = await db
    .selectDistinct({ id: jugadores.id })
    .from(jugadorApoderado)
    .innerJoin(jugadores, eq(jugadores.id, jugadorApoderado.jugador_id))
    .where(
      and(
        eq(jugadorApoderado.apoderado_id, titularApoderadoId),
        sql`${jugadores.marcado_retiro_en} is not null`,
        inArray(jugadores.estado, ["precargado", "activo"]),
      ),
    );
  return filas.map((f) => f.id).filter((j) => !excluir.includes(j));
}

async function titular(db: Ejecutor, s: Fila): Promise<SolicitudResumen["titular"]> {
  if (s.titular_apoderado_id) {
    const [a] = await db
      .select({ nombre: apoderados.nombre, apellido: apoderados.apellido })
      .from(apoderados)
      .where(eq(apoderados.id, s.titular_apoderado_id));
    if (a) return { nombre_completo: nombreCompleto(a.nombre, a.apellido), rol: "apoderado" };
  }
  if (s.titular_jugador_id) {
    const [j] = await db
      .select({ nombre: jugadores.nombre, apellido: jugadores.apellido })
      .from(jugadores)
      .where(eq(jugadores.id, s.titular_jugador_id));
    if (j) return { nombre_completo: nombreCompleto(j.nombre, j.apellido), rol: "jugador" };
  }
  // La solicitud de un segundo apoderado no tiene titular: es él mismo.
  if (s.tipo === "segundo_apoderado") {
    const [a] = await db
      .select({ nombre: apoderados.nombre, apellido: apoderados.apellido })
      .from(apoderados)
      .where(eq(apoderados.solicitud_id, s.id))
      .limit(1);
    if (a) return { nombre_completo: nombreCompleto(a.nombre, a.apellido), rol: "apoderado" };
  }
  return { nombre_completo: "(sin datos)", rol: "apoderado" };
}

async function pendientes(db: Ejecutor, jugadoresIds: string[], apoderadosIds: string[]): Promise<number> {
  let total = 0;
  if (jugadoresIds.length > 0) {
    total += (
      await db
        .select({ id: jugadores.id })
        .from(jugadores)
        .where(and(inArray(jugadores.id, jugadoresIds), eq(jugadores.estado, "pendiente")))
    ).length;
  }
  if (apoderadosIds.length > 0) {
    total += (
      await db
        .select({ id: apoderados.id })
        .from(apoderados)
        .where(and(inArray(apoderados.id, apoderadosIds), eq(apoderados.estado, "pendiente")))
    ).length;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export async function listarSolicitudes(
  db: Ejecutor,
  filtros: z.output<typeof solicitudesQuery>,
): Promise<SolicitudResumen[]> {
  const filas = await db
    .select()
    .from(solicitudesRegistro)
    .where(filtros.estado ? eq(solicitudesRegistro.estado, filtros.estado) : undefined)
    .orderBy(desc(solicitudesRegistro.creada_en), solicitudesRegistro.id);
  return Promise.all(
    filas.map(async (s) => {
      const m = await miembros(db, s);
      return {
        id: s.id,
        creada_en: s.creada_en.toISOString(),
        estado: s.estado,
        tipo: s.tipo,
        coincide_base: s.coincide_base,
        avisos: s.avisos,
        titular: await titular(db, s),
        personas_pendientes: await pendientes(db, m.propiosJ, m.propiosA),
      };
    }),
  );
}

export async function detalleSolicitud(db: Ejecutor, id: string): Promise<SolicitudDetalle> {
  const s = await filaSolicitud(db, id);
  const m = await miembros(db, s);
  return {
    id: s.id,
    creada_en: s.creada_en.toISOString(),
    estado: s.estado,
    tipo: s.tipo,
    consentimiento_en: fechaHora(s.consentimiento_en),
    revisada_en: fechaHora(s.revisada_en),
    coincide_base: s.coincide_base,
    avisos: s.avisos,
    jugadores: await Promise.all(
      m.visiblesJ.map(async (j) => ({ ...(await detalleJugador(db, j)), propia: m.propiosJ.includes(j) })),
    ),
    apoderados: await Promise.all(
      m.visiblesA.map(async (a) => ({ ...(await detalleApoderado(db, a)), propia: m.propiosA.includes(a) })),
    ),
    vinculos: m.vinculos.map((v) => ({
      jugador_id: v.jugador_id,
      apoderado_id: v.apoderado_id,
      paga_mensualidad: v.paga_mensualidad,
      estado: v.estado,
    })),
  };
}

// ---------------------------------------------------------------------------
// Cierre
// ---------------------------------------------------------------------------

/** Si ya no queda nada pendiente de decidir desde la solicitud, pasa a revisada. */
async function cerrarSiCorresponde(tx: Ejecutor, solicitudId: string): Promise<void> {
  const s = await filaSolicitud(tx, solicitudId);
  if (s.estado !== "pendiente") return;
  const m = await miembros(tx, s);
  const quedan = (await pendientes(tx, m.propiosJ, m.propiosA)) + m.vinculos.filter((v) => v.estado === "pendiente").length;
  if (quedan === 0) {
    await tx
      .update(solicitudesRegistro)
      .set({ estado: "revisada", revisada_en: new Date() })
      .where(eq(solicitudesRegistro.id, solicitudId));
    // Una solicitud revisada ya no restaura a nadie: una copia que le quede (la de un hijo marcado
    // "ya no está", que nunca pasa a pendiente) solo bloquearía a las solicitudes que vengan.
    await tx.delete(fichasPrevias).where(eq(fichasPrevias.solicitud_id, solicitudId));
  }
}

/**
 * «Rechazar todo»: la marca de "ya no está" que puso esta solicitud se deshace con su copia. El
 * hijo marcado sigue `precargado` y no es propio de la solicitud, así que no pasa por
 * `rechazarPersona`.
 */
async function deshacerMarcas(tx: Ejecutor, solicitudId: string, yaRechazados: string[]) {
  const copias = await tx
    .select({ jugador_id: fichasPrevias.jugador_id, datos: fichasPrevias.datos })
    .from(fichasPrevias)
    .innerJoin(jugadores, eq(jugadores.id, fichasPrevias.jugador_id))
    .where(and(eq(fichasPrevias.solicitud_id, solicitudId), eq(jugadores.estado, "precargado")));
  for (const c of copias) {
    if (!c.jugador_id || yaRechazados.includes(c.jugador_id)) continue;
    const previo = previoJugador.parse(c.datos).marcado_retiro_en;
    if (previo === undefined) continue;
    await tx
      .update(jugadores)
      .set({ marcado_retiro_en: previo === null ? null : new Date(previo) })
      .where(eq(jugadores.id, c.jugador_id));
  }
}

/**
 * Revisa también las otras solicitudes afectadas: la propia de cada persona decidida (el segundo
 * apoderado se decide desde la que lo agregó), la de origen y las de segundo apoderado de esta.
 */
async function cerrarRelacionadas(tx: Ejecutor, s: Fila, jugadoresIds: string[], apoderadosIds: string[]) {
  const ids = new Set<string>();
  if (s.solicitud_origen_id) ids.add(s.solicitud_origen_id);
  for (const f of await tx
    .select({ id: solicitudesRegistro.id })
    .from(solicitudesRegistro)
    .where(eq(solicitudesRegistro.solicitud_origen_id, s.id))) {
    ids.add(f.id);
  }
  if (jugadoresIds.length > 0) {
    for (const f of await tx.select({ s: jugadores.solicitud_id }).from(jugadores).where(inArray(jugadores.id, jugadoresIds))) {
      if (f.s) ids.add(f.s);
    }
  }
  if (apoderadosIds.length > 0) {
    for (const f of await tx.select({ s: apoderados.solicitud_id }).from(apoderados).where(inArray(apoderados.id, apoderadosIds))) {
      if (f.s) ids.add(f.s);
    }
  }
  ids.delete(s.id);
  for (const otra of ids) await cerrarSiCorresponde(tx, otra);
}

/** Las copias de la ficha previa de una persona ya no se necesitan una vez decidida. */
async function borrarFichasPrevias(tx: Ejecutor, tipo: "jugador" | "apoderado", ids: string[]) {
  if (ids.length === 0) return;
  const columna = tipo === "jugador" ? fichasPrevias.jugador_id : fichasPrevias.apoderado_id;
  await tx.delete(fichasPrevias).where(inArray(columna, ids));
}

// ---------------------------------------------------------------------------
// Aprobar
// ---------------------------------------------------------------------------

/**
 * Aprobación total o parcial. Cada persona tiene que ser propia de la solicitud y estar
 * pendiente; Mony completa número, categoría, becas y método de pago. Los vínculos se aprueban
 * solo si vienen listados, y solo si al final el jugador y el apoderado quedan activos. Si algo
 * no se cumple, no se aprueba nada.
 */
export async function aprobarSolicitud(
  db: Ejecutor,
  id: string,
  pedido: z.output<typeof aprobarRequest>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tomarCandado(tx);
    const s = await filaSolicitud(tx, id, true);
    const m = await miembros(tx, s);
    const propiosJ = new Set(m.propiosJ);
    const propiosA = new Set(m.propiosA);
    const cats = await cargarCategorias(tx);

    // Los apoderados van primero: un apoderado aprobado en este mismo pedido ya cuenta como
    // contacto del jugador adulto (solo cuenta uno activo).
    for (const pa of pedido.apoderados) {
      if (!propiosA.has(pa.id)) throw fueraDeLaSolicitud();
      const [a] = await tx
        .select({
          estado: apoderados.estado,
          nombre: apoderados.nombre,
          apellido: apoderados.apellido,
          telefono: apoderados.telefono,
          foto_id: apoderados.foto_id,
        })
        .from(apoderados)
        .where(eq(apoderados.id, pa.id))
        .for("update");
      if (!a || a.estado !== "pendiente") throw fueraDeLaSolicitud();
      const faltan = faltantesApoderado(a);
      if (faltan.length > 0) throw incompleto(faltan);
      await conRestricciones(() =>
        tx
          .update(apoderados)
          .set({
            ...(pa.metodo_pago ? { metodo_pago: pa.metodo_pago } : {}),
            estado: "activo",
            credencial_token: generarToken(),
          })
          .where(eq(apoderados.id, pa.id)),
      );
    }

    for (const pj of pedido.jugadores) {
      if (!propiosJ.has(pj.id)) throw fueraDeLaSolicitud();
      const [j] = await tx
        .select({
          estado: jugadores.estado,
          disciplina: jugadores.disciplina,
          nombre: jugadores.nombre,
          apellido: jugadores.apellido,
          fecha_nacimiento: jugadores.fecha_nacimiento,
          telefono: jugadores.telefono,
          foto_id: jugadores.foto_id,
          marcado_retiro_en: jugadores.marcado_retiro_en,
          tiene_apoderado: tieneApoderadoVigente,
        })
        .from(jugadores)
        .where(eq(jugadores.id, pj.id))
        .for("update");
      if (!j || j.estado !== "pendiente") throw fueraDeLaSolicitud();
      if (j.marcado_retiro_en !== null) {
        throw conflicto(MENSAJE_MARCADO);
      }
      if (pj.categoria_id !== null) await verificarCategoria(tx, pj.categoria_id, j.disciplina);
      // Un vínculo listado en este pedido puede darle contacto: se confirma al final.
      const contactoEnPedido = pedido.vinculos.some((v) => v.jugador_id === pj.id);
      const faltan = requisitosJugador(
        faltantesJugador(
          { ...j, categoria_id: pj.categoria_id, numero_camiseta: pj.numero_camiseta },
          j.tiene_apoderado || contactoEnPedido,
          cats,
        ),
      );
      if (faltan.length > 0) throw incompleto(faltan);
      await conRestricciones(() =>
        tx
          .update(jugadores)
          .set({
            categoria_id: pj.categoria_id,
            numero_camiseta: pj.numero_camiseta,
            beca_mensualidad_pct: pj.beca_mensualidad_pct,
            beca_torneos_pct: pj.beca_torneos_pct,
            beca_campus_pct: pj.beca_campus_pct,
            ...(pj.metodo_pago ? { metodo_pago: pj.metodo_pago } : {}),
            estado: "activo",
            credencial_token: generarToken(),
          })
          .where(eq(jugadores.id, pj.id)),
      );
    }

    // Los vínculos van al final: así cuentan las personas aprobadas en este mismo pedido.
    const deEsta = new Set(m.vinculos.filter((v) => v.estado === "pendiente").map((v) => `${v.jugador_id}|${v.apoderado_id}`));
    for (const pv of pedido.vinculos) {
      if (!deEsta.has(`${pv.jugador_id}|${pv.apoderado_id}`)) throw fueraDeLaSolicitud();
      const [jv] = await tx.select({ estado: jugadores.estado }).from(jugadores).where(eq(jugadores.id, pv.jugador_id)).for("update");
      const [av] = await tx.select({ estado: apoderados.estado }).from(apoderados).where(eq(apoderados.id, pv.apoderado_id)).for("update");
      if (jv?.estado === "inactivo") {
        throw conflicto("El jugador de ese vínculo está inactivo: reactívalo en su ficha antes de aprobar el vínculo");
      }
      if (jv?.estado === "precargado") {
        throw conflicto("El jugador de ese vínculo está precargado: complétalo y actívalo en su ficha antes de aprobar el vínculo");
      }
      if (jv?.estado !== "activo") {
        throw conflicto("El jugador de ese vínculo no está activo: hay que aprobarlo antes que el vínculo");
      }
      if (av?.estado === "precargado") {
        throw conflicto("El apoderado de ese vínculo está precargado: complétalo y actívalo en su ficha antes de aprobar el vínculo");
      }
      if (av?.estado !== "activo") {
        throw conflicto("El apoderado de ese vínculo no está activo: hay que aprobarlo antes que el vínculo");
      }
      await tx
        .update(jugadorApoderado)
        .set({ estado: "activo" })
        .where(
          and(
            eq(jugadorApoderado.jugador_id, pv.jugador_id),
            eq(jugadorApoderado.apoderado_id, pv.apoderado_id),
            eq(jugadorApoderado.estado, "pendiente"),
          ),
        );
    }

    const aprobadosJ = pedido.jugadores.map((j) => j.id);
    const aprobadosA = pedido.apoderados.map((a) => a.id);
    // Con los vínculos ya decididos: cada jugador aprobado tiene que cumplir de verdad (un adulto
    // sin teléfono, con un apoderado activo y un vínculo activo). Si no, no se aprueba nada.
    for (const jugadorId of aprobadosJ) {
      const [j] = await tx
        .select({
          nombre: jugadores.nombre,
          apellido: jugadores.apellido,
          fecha_nacimiento: jugadores.fecha_nacimiento,
          categoria_id: jugadores.categoria_id,
          numero_camiseta: jugadores.numero_camiseta,
          telefono: jugadores.telefono,
          foto_id: jugadores.foto_id,
          disciplina: jugadores.disciplina,
          tiene_apoderado: tieneApoderadoVigente,
        })
        .from(jugadores)
        .where(eq(jugadores.id, jugadorId));
      if (!j) throw noEncontrado();
      const faltan = requisitosJugador(faltantesJugador(j, j.tiene_apoderado, cats));
      if (faltan.length > 0) throw incompleto(faltan);
    }
    await borrarFichasPrevias(tx, "jugador", aprobadosJ);
    await borrarFichasPrevias(tx, "apoderado", aprobadosA);
    await cerrarSiCorresponde(tx, id);
    await cerrarRelacionadas(tx, s, aprobadosJ, aprobadosA);
  });
}

// ---------------------------------------------------------------------------
// Rechazar
// ---------------------------------------------------------------------------

const textoONulo = z.string().nullable();
/** Lo que S2 guarda en `fichas_previas.datos` (ver el PR #23). Se restaura solo lo que viene. */
const previoJugador = z
  .object({
    nombre: textoONulo,
    apellido: textoONulo,
    fecha_nacimiento: z.iso.date().nullable(),
    disciplina: z.enum(DISCIPLINAS),
    categoria_id: z.number().int().positive().nullable(),
    numero_camiseta: z.string().regex(/^[0-9]{1,2}$/).nullable(),
    telefono: z.string().regex(/^[0-9]{9}$/).nullable(),
    email: textoONulo,
    metodo_pago: z.enum(METODOS_PAGO).nullable(),
    foto_id: z.uuid().nullable(),
    estado: z.enum(ESTADOS_PERSONA),
    solicitud_id: z.uuid().nullable(),
    marcado_retiro_en: z.iso.datetime({ offset: true }).nullable(),
  })
  .partial();
const previoApoderado = previoJugador.pick({
  nombre: true,
  apellido: true,
  telefono: true,
  email: true,
  metodo_pago: true,
  foto_id: true,
  estado: true,
  solicitud_id: true,
});

/**
 * Qué foto queda al restaurar (decisión de Ignacio, 2026-11-12): se borra solo la foto que trajo
 * la solicitud; si Mony la cambió desde el panel después, se conserva la de Mony.
 * - La foto que trajo la solicitud se guardó en la misma transacción que la solicitud (S2), así
 *   que tiene su mismo `creado_en` (`now()` es la hora de inicio de la transacción). Una foto
 *   más nueva la subió Mony con `cambiarFoto`.
 * - Si vuelve la de la copia y ya no existe (`cambiarFoto` borra la anterior), la ficha queda sin
 *   foto en vez de apuntar a una borrada.
 */
async function fotoAlRestaurar(
  tx: Ejecutor,
  solicitudId: string,
  actual: string | null,
  copia: string | null | undefined,
): Promise<{ foto_id?: string | null }> {
  if (copia === undefined) return {};
  if (actual !== null && actual !== copia) {
    const [f] = await tx
      .select({ id: fotos.id })
      .from(fotos)
      .innerJoin(solicitudesRegistro, eq(solicitudesRegistro.id, solicitudId))
      .where(and(eq(fotos.id, actual), sql`${fotos.creado_en} > ${solicitudesRegistro.creada_en}`));
    if (f) return { foto_id: actual };
  }
  if (copia === null) return { foto_id: null };
  const [f] = await tx.select({ id: fotos.id }).from(fotos).where(eq(fotos.id, copia));
  return { foto_id: f ? copia : null };
}

/**
 * Rechaza a una persona. Si ya existía antes de la solicitud (hay ficha previa), vuelve a como
 * estaba: sus campos, su foto, su estado y su `solicitud_id`, y se borra la foto que trajo la
 * solicitud (una que Mony subió después se conserva; ver `fotoAlRestaurar`). Si es nueva, queda `rechazado`. En los dos casos, sin credencial.
 */
async function rechazarPersona(
  tx: Ejecutor,
  solicitudId: string,
  tipo: "jugador" | "apoderado",
  personaId: string,
): Promise<void> {
  // A lo más una por persona (unique): la del estado original, antes de la primera solicitud.
  const [previa] = await tx
    .select({ datos: fichasPrevias.datos, solicitud_id: fichasPrevias.solicitud_id })
    .from(fichasPrevias)
    .where(eq(tipo === "jugador" ? fichasPrevias.jugador_id : fichasPrevias.apoderado_id, personaId));
  const tabla = tipo === "jugador" ? jugadores : apoderados;
  const [actual] = await tx.select({ foto_id: tabla.foto_id }).from(tabla).where(eq(tabla.id, personaId));
  if (!actual) throw noEncontrado();
  // La copia la restaura solo la solicitud que la escribió (regla de fichas_previas).
  if (previa && previa.solicitud_id !== solicitudId) {
    throw conflicto("Esa persona tiene cambios de otra solicitud: se decide desde esa solicitud");
  }

  if (!previa) {
    // Sin copia, solo se rechaza a quien esta solicitud creó (persona nueva del formulario). A
    // alguien que ya existía no se lo deja `rechazado`: no habría cómo volverlo atrás.
    const [p] = await tx
      .select({ origen: tabla.origen, solicitud_id: tabla.solicitud_id })
      .from(tabla)
      .where(eq(tabla.id, personaId));
    const segunda =
      p?.solicitud_id && p.solicitud_id !== solicitudId
        ? (await filaSolicitud(tx, p.solicitud_id)).solicitud_origen_id === solicitudId
        : false;
    if (p?.origen !== "formulario" || (p.solicitud_id !== solicitudId && !segunda)) {
      throw conflicto(
        "Esa persona ya existía y no hay registro de cómo estaba antes de esta solicitud: no se puede rechazar sin perder su ficha",
      );
    }
    if (tipo === "jugador") await tx.update(jugadores).set({ estado: "rechazado", credencial_token: null }).where(eq(jugadores.id, personaId));
    else await tx.update(apoderados).set({ estado: "rechazado", credencial_token: null }).where(eq(apoderados.id, personaId));
    return;
  }
  // Si la copia no tiene la forma esperada, falla (500) y no se toca nada: denegar por defecto.
  const estadoPrevio = (tipo === "jugador" ? previoJugador : previoApoderado).parse(previa.datos).estado;
  if (estadoPrevio !== undefined && estadoPrevio !== "precargado") {
    throw conflicto("La ficha previa de esa persona no es la de un precargado: no se puede restaurar sola");
  }
  if (tipo === "jugador") {
    const d = previoJugador.parse(previa.datos);
    // La fecha de "ya no está" va en la copia como texto ISO: vuelve a ser fecha.
    const { marcado_retiro_en, ...resto } = d;
    await tx
      .update(jugadores)
      .set({
        ...resto,
        ...(await fotoAlRestaurar(tx, solicitudId, actual.foto_id, d.foto_id)),
        ...(marcado_retiro_en !== undefined
          ? { marcado_retiro_en: marcado_retiro_en === null ? null : new Date(marcado_retiro_en) }
          : {}),
        estado: "precargado",
        credencial_token: null,
      })
      .where(eq(jugadores.id, personaId));
  } else {
    const d = previoApoderado.parse(previa.datos);
    await tx
      .update(apoderados)
      .set({
        ...d,
        ...(await fotoAlRestaurar(tx, solicitudId, actual.foto_id, d.foto_id)),
        estado: "precargado",
        credencial_token: null,
      })
      .where(eq(apoderados.id, personaId));
  }
  const [despues] = await tx.select({ foto_id: tabla.foto_id }).from(tabla).where(eq(tabla.id, personaId));
  if (actual.foto_id && actual.foto_id !== despues?.foto_id) await borrarFoto(tx, actual.foto_id);
}

/**
 * Rechaza a las personas y los vínculos indicados, o, si no viene ninguno de los dos, todo lo
 * pendiente de la solicitud.
 * - Personas: propias de la solicitud y pendientes. Se borran los vínculos que esta solicitud (o
 *   su origen) creó para ellas, también si ya estaban activos: no queda ninguno hacia alguien
 *   rechazado.
 * - Vínculos: pendientes y de esta solicitud. Se borran; sus personas siguen como estaban.
 * - Sin nada indicado, también se borran los vínculos pendientes hacia personas de otras
 *   solicitudes.
 */
export async function rechazarSolicitud(
  db: Ejecutor,
  id: string,
  pedido: z.output<typeof rechazarRequest>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tomarCandado(tx);
    const s = await filaSolicitud(tx, id, true);
    const m = await miembros(tx, s);
    const parcial = pedido.personas !== undefined || pedido.vinculos !== undefined;
    let candidatosJ: string[];
    let candidatosA: string[];
    if (parcial) {
      const personas = pedido.personas ?? [];
      candidatosJ = unicos(personas.filter((p) => p.rol === "jugador").map((p) => p.id));
      candidatosA = unicos(personas.filter((p) => p.rol === "apoderado").map((p) => p.id));
      if (candidatosJ.some((j) => !m.propiosJ.includes(j)) || candidatosA.some((a) => !m.propiosA.includes(a))) {
        throw fueraDeLaSolicitud();
      }
    } else {
      candidatosJ = m.propiosJ;
      candidatosA = m.propiosA;
    }
    const rechJ =
      candidatosJ.length === 0
        ? []
        : (
            await tx
              .select({ id: jugadores.id })
              .from(jugadores)
              .where(and(inArray(jugadores.id, candidatosJ), eq(jugadores.estado, "pendiente")))
              .for("update")
          ).map((f) => f.id);
    const rechA =
      candidatosA.length === 0
        ? []
        : (
            await tx
              .select({ id: apoderados.id })
              .from(apoderados)
              .where(and(inArray(apoderados.id, candidatosA), eq(apoderados.estado, "pendiente")))
              .for("update")
          ).map((f) => f.id);
    if (parcial && rechJ.length + rechA.length !== candidatosJ.length + candidatosA.length) {
      throw fueraDeLaSolicitud();
    }
    const pendientesDeEsta = new Set(
      m.vinculos.filter((v) => v.estado === "pendiente").map((v) => `${v.jugador_id}|${v.apoderado_id}`),
    );
    const vinculosPedidos = pedido.vinculos ?? [];
    if (vinculosPedidos.some((v) => !pendientesDeEsta.has(`${v.jugador_id}|${v.apoderado_id}`))) {
      throw fueraDeLaSolicitud();
    }

    // Vínculos que crearon esta solicitud, su origen o sus segundas, hacia los rechazados.
    const familia = [s.id, ...(s.solicitud_origen_id ? [s.solicitud_origen_id] : [])];
    const segundas = await tx
      .select({ id: solicitudesRegistro.id })
      .from(solicitudesRegistro)
      .where(eq(solicitudesRegistro.solicitud_origen_id, s.id));
    familia.push(...segundas.map((f) => f.id));
    const haciaRechazados = or(
      rechJ.length > 0 ? inArray(jugadorApoderado.jugador_id, rechJ) : undefined,
      rechA.length > 0 ? inArray(jugadorApoderado.apoderado_id, rechA) : undefined,
    );
    if (haciaRechazados) {
      await tx.delete(jugadorApoderado).where(and(inArray(jugadorApoderado.solicitud_id, familia), haciaRechazados));
    }
    // Un vínculo de esta solicitud (en una de segundo apoderado, también el que creó su origen
    // hacia él): se borra solo si sigue pendiente.
    for (const v of vinculosPedidos) {
      await tx
        .delete(jugadorApoderado)
        .where(
          and(
            eq(jugadorApoderado.jugador_id, v.jugador_id),
            eq(jugadorApoderado.apoderado_id, v.apoderado_id),
            eq(jugadorApoderado.estado, "pendiente"),
            inArray(jugadorApoderado.solicitud_id, familia),
          ),
        );
    }
    if (!parcial) {
      await tx
        .delete(jugadorApoderado)
        .where(and(eq(jugadorApoderado.solicitud_id, s.id), eq(jugadorApoderado.estado, "pendiente")));
    }

    // Quien era de la solicitud solo por un vínculo que se acaba de borrar (un precargado que ella
    // completó, sin solicitud_id) ya no se podría decidir desde ninguna: vuelve a como estaba.
    const despues = await miembros(tx, s);
    const arrastrados = async (antes: string[], ahora: string[], ya: string[], tabla: typeof jugadores | typeof apoderados) => {
      const sueltos = antes.filter((x) => !ahora.includes(x) && !ya.includes(x));
      if (sueltos.length === 0) return [];
      const filas = await tx
        .select({ id: tabla.id })
        .from(tabla)
        .where(and(inArray(tabla.id, sueltos), eq(tabla.estado, "pendiente")))
        .for("update");
      return filas.map((f) => f.id);
    };
    rechJ.push(...(await arrastrados(m.propiosJ, despues.propiosJ, rechJ, jugadores)));
    rechA.push(...(await arrastrados(m.propiosA, despues.propiosA, rechA, apoderados)));

    for (const j of rechJ) await rechazarPersona(tx, s.id, "jugador", j);
    for (const a of rechA) await rechazarPersona(tx, s.id, "apoderado", a);
    if (!parcial) await deshacerMarcas(tx, s.id, rechJ);
    await borrarFichasPrevias(tx, "jugador", rechJ);
    await borrarFichasPrevias(tx, "apoderado", rechA);
    await cerrarSiCorresponde(tx, id);
    await cerrarRelacionadas(tx, s, rechJ, rechA);
  });
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

/**
 * Link privado nuevo: `/familia/:token` en una solicitud de formulario, `/completar/:token` en
 * una de segundo apoderado. La base guarda solo el hash, así que el anterior deja de servir.
 */
export async function nuevoLink(db: Ejecutor, id: string, baseUrl: string): Promise<string> {
  const token = generarToken();
  const [fila] = await db
    .update(solicitudesRegistro)
    .set({ token_acceso_hash: hashToken(token) })
    .where(eq(solicitudesRegistro.id, id))
    .returning({ tipo: solicitudesRegistro.tipo });
  if (!fila) throw noEncontrado();
  const ruta = fila.tipo === "segundo_apoderado" ? "completar" : "familia";
  return `${baseUrl.replace(/\/+$/, "")}/${ruta}/${encodeURIComponent(token)}`;
}
