/**
 * Solicitudes de registro en el panel: listado, detalle, aprobar, rechazar y link nuevo.
 *
 * Qué personas son de una solicitud `s` (lo escribe S2, ver CLAUDE.md):
 * - las que tienen `solicitud_id = s` (personas nuevas, o precargadas del RUT de quien llena);
 * - las de los vínculos que creó la solicitud (`jugador_apoderado.solicitud_id = s`): un hijo que
 *   ya existía y se nombró por RUT, o el apoderado ya registrado que vuelve a usar el formulario.
 * Una solicitud de segundo apoderado tiene su propia fila (`tipo = segundo_apoderado`) y su
 * apoderado apunta a ella.
 */
import type {
  aprobarRequest,
  rechazarRequest,
  solicitudDetalle,
  solicitudResumen,
  solicitudesQuery,
} from "@club-colina/shared";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Ejecutor } from "../../db/cliente";
import { apoderados, jugadorApoderado, jugadores, solicitudesRegistro } from "../../db/schema";
import { ErrorApi, noEncontrado } from "../../lib/errores";
import { generarToken, hashToken } from "../../lib/tokens";
import { incompleto } from "./acciones";
import { conRestricciones } from "./errores-db";
import { cargarCategorias, detalleApoderado, detalleJugador, tieneApoderadoVigente, verificarCategoria } from "./personas";
import { faltantesApoderado, faltantesJugador, nombreCompleto, requisitosJugador } from "./reglas";

type SolicitudResumen = z.input<typeof solicitudResumen>;
type SolicitudDetalle = z.input<typeof solicitudDetalle>;

const fechaHora = (d: Date | null) => (d ? d.toISOString() : null);

/** Ids de las personas y los vínculos de una solicitud. */
async function miembros(db: Ejecutor, solicitudId: string) {
  const vinculos = await db
    .select({
      jugador_id: jugadorApoderado.jugador_id,
      apoderado_id: jugadorApoderado.apoderado_id,
      paga_mensualidad: jugadorApoderado.paga_mensualidad,
      estado: jugadorApoderado.estado,
      creado_en: jugadorApoderado.creado_en,
    })
    .from(jugadorApoderado)
    .where(eq(jugadorApoderado.solicitud_id, solicitudId))
    .orderBy(jugadorApoderado.creado_en, jugadorApoderado.jugador_id, jugadorApoderado.apoderado_id);
  const jugadoresIds = new Set(vinculos.map((v) => v.jugador_id));
  const apoderadosIds = new Set(vinculos.map((v) => v.apoderado_id));
  const propiosJ = await db.select({ id: jugadores.id }).from(jugadores).where(eq(jugadores.solicitud_id, solicitudId));
  const propiosA = await db.select({ id: apoderados.id }).from(apoderados).where(eq(apoderados.solicitud_id, solicitudId));
  for (const j of propiosJ) jugadoresIds.add(j.id);
  for (const a of propiosA) apoderadosIds.add(a.id);
  return { vinculos, jugadoresIds: [...jugadoresIds], apoderadosIds: [...apoderadosIds] };
}

async function filaSolicitud(db: Ejecutor, id: string, bloquear = false) {
  const consulta = db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, id));
  const [fila] = bloquear ? await consulta.for("update") : await consulta;
  if (!fila) throw noEncontrado();
  return fila;
}

/**
 * Quién llenó la solicitud, para el listado. En orden: el apoderado con ese `solicitud_id`; el
 * apoderado de los vínculos que creó (uno ya registrado que vuelve a usar el formulario), sin
 * contar a los otros apoderados que esa solicitud agregó; y si no, el jugador adulto.
 */
async function titular(
  db: Ejecutor,
  s: { id: string; tipo: string },
): Promise<SolicitudResumen["titular"]> {
  const [apo] = await db
    .select({ nombre: apoderados.nombre, apellido: apoderados.apellido })
    .from(apoderados)
    .where(eq(apoderados.solicitud_id, s.id))
    .orderBy(apoderados.creado_en)
    .limit(1);
  if (apo) return { nombre_completo: nombreCompleto(apo.nombre, apo.apellido), rol: "apoderado" };
  if (s.tipo === "formulario") {
    const [porVinculo] = await db
      .select({ nombre: apoderados.nombre, apellido: apoderados.apellido })
      .from(jugadorApoderado)
      .innerJoin(apoderados, eq(apoderados.id, jugadorApoderado.apoderado_id))
      .where(
        and(
          eq(jugadorApoderado.solicitud_id, s.id),
          sql`(${apoderados.solicitud_id} is null or ${apoderados.solicitud_id} not in (select ${solicitudesRegistro.id} from ${solicitudesRegistro} where ${solicitudesRegistro.solicitud_origen_id} = ${s.id}))`,
        ),
      )
      .orderBy(jugadorApoderado.creado_en)
      .limit(1);
    if (porVinculo) {
      return { nombre_completo: nombreCompleto(porVinculo.nombre, porVinculo.apellido), rol: "apoderado" };
    }
    const [jug] = await db
      .select({ nombre: jugadores.nombre, apellido: jugadores.apellido })
      .from(jugadores)
      .where(eq(jugadores.solicitud_id, s.id))
      .orderBy(jugadores.creado_en)
      .limit(1);
    if (jug) return { nombre_completo: nombreCompleto(jug.nombre, jug.apellido), rol: "jugador" };
  }
  return { nombre_completo: "(sin datos)", rol: "apoderado" };
}

async function personasPendientes(db: Ejecutor, jugadoresIds: string[], apoderadosIds: string[]): Promise<number> {
  let total = 0;
  if (jugadoresIds.length > 0) {
    const filas = await db
      .select({ id: jugadores.id })
      .from(jugadores)
      .where(and(inArray(jugadores.id, jugadoresIds), eq(jugadores.estado, "pendiente")));
    total += filas.length;
  }
  if (apoderadosIds.length > 0) {
    const filas = await db
      .select({ id: apoderados.id })
      .from(apoderados)
      .where(and(inArray(apoderados.id, apoderadosIds), eq(apoderados.estado, "pendiente")));
    total += filas.length;
  }
  return total;
}

export async function listarSolicitudes(
  db: Ejecutor,
  filtros: z.output<typeof solicitudesQuery>,
): Promise<SolicitudResumen[]> {
  const filas = await db
    .select()
    .from(solicitudesRegistro)
    .where(filtros.estado ? eq(solicitudesRegistro.estado, filtros.estado) : undefined)
    .orderBy(desc(solicitudesRegistro.creada_en), solicitudesRegistro.id);
  // Son decenas; una consulta chica por solicitud es más clara que un join de todo.
  return Promise.all(
    filas.map(async (s) => {
      const m = await miembros(db, s.id);
      return {
        id: s.id,
        creada_en: s.creada_en.toISOString(),
        estado: s.estado,
        tipo: s.tipo,
        coincide_base: s.coincide_base,
        avisos: s.avisos,
        titular: await titular(db, s),
        personas_pendientes: await personasPendientes(db, m.jugadoresIds, m.apoderadosIds),
      };
    }),
  );
}

/**
 * Hijos de los apoderados de la solicitud marcados "ya no está en el club" y que Mony todavía no
 * dio de baja. El formulario no les asigna `solicitud_id` ni crea un vínculo nuevo, así que la
 * base no guarda qué solicitud los marcó: se muestran todos los marcados de esa familia, para
 * que el aviso `hijo_marcado_ya_no_esta` apunte a una ficha concreta. Solo se muestran: no se
 * aprueban ni se rechazan por la solicitud (se desactivan desde su ficha).
 */
async function marcadosYaNoEsta(db: Ejecutor, apoderadosIds: string[], excluir: string[]): Promise<string[]> {
  if (apoderadosIds.length === 0) return [];
  const filas = await db
    .selectDistinct({ id: jugadores.id })
    .from(jugadorApoderado)
    .innerJoin(jugadores, eq(jugadores.id, jugadorApoderado.jugador_id))
    .where(
      and(
        inArray(jugadorApoderado.apoderado_id, apoderadosIds),
        sql`${jugadores.marcado_retiro_en} is not null`,
        sql`${jugadores.estado} <> 'inactivo'`,
      ),
    );
  return filas.map((f) => f.id).filter((j) => !excluir.includes(j));
}

export async function detalleSolicitud(db: Ejecutor, id: string): Promise<SolicitudDetalle> {
  const s = await filaSolicitud(db, id);
  const m = await miembros(db, id);
  const marcados = await marcadosYaNoEsta(db, m.apoderadosIds, m.jugadoresIds);
  return {
    id: s.id,
    creada_en: s.creada_en.toISOString(),
    estado: s.estado,
    tipo: s.tipo,
    consentimiento_en: fechaHora(s.consentimiento_en),
    revisada_en: fechaHora(s.revisada_en),
    coincide_base: s.coincide_base,
    avisos: s.avisos,
    jugadores: await Promise.all([...m.jugadoresIds, ...marcados].map((j) => detalleJugador(db, j))),
    apoderados: await Promise.all(m.apoderadosIds.map((a) => detalleApoderado(db, a))),
    vinculos: m.vinculos.map((v) => ({
      jugador_id: v.jugador_id,
      apoderado_id: v.apoderado_id,
      paga_mensualidad: v.paga_mensualidad,
      estado: v.estado,
    })),
  };
}

const fueraDeLaSolicitud = () =>
  new ErrorApi(409, "conflicto", "Esa persona o vínculo no está pendiente en esta solicitud");

/**
 * Después de aprobar o rechazar desde una solicitud, revisa también las solicitudes propias de
 * las personas tocadas: el segundo apoderado se decide desde la solicitud que lo agregó (ahí
 * está su vínculo), pero tiene su propia fila, que también tiene que cerrarse.
 */
async function cerrarRelacionadas(tx: Ejecutor, actual: string, jugadoresIds: string[], apoderadosIds: string[]) {
  const ids = new Set<string>();
  if (jugadoresIds.length > 0) {
    for (const f of await tx
      .select({ s: jugadores.solicitud_id })
      .from(jugadores)
      .where(inArray(jugadores.id, jugadoresIds))) {
      if (f.s) ids.add(f.s);
    }
  }
  if (apoderadosIds.length > 0) {
    for (const f of await tx
      .select({ s: apoderados.solicitud_id })
      .from(apoderados)
      .where(inArray(apoderados.id, apoderadosIds))) {
      if (f.s) ids.add(f.s);
    }
  }
  ids.delete(actual);
  for (const otra of ids) await cerrarSiCorresponde(tx, otra);
}

/** Si ya no queda nada pendiente, la solicitud pasa a revisada. */
async function cerrarSiCorresponde(tx: Ejecutor, solicitudId: string): Promise<void> {
  const m = await miembros(tx, solicitudId);
  const quedan =
    (await personasPendientes(tx, m.jugadoresIds, m.apoderadosIds)) +
    m.vinculos.filter((v) => v.estado === "pendiente").length;
  if (quedan === 0) {
    await tx
      .update(solicitudesRegistro)
      .set({ estado: "revisada", revisada_en: new Date() })
      .where(and(eq(solicitudesRegistro.id, solicitudId), eq(solicitudesRegistro.estado, "pendiente")));
  }
}

/**
 * Aprobación total o parcial. Cada persona tiene que estar pendiente y ser de la solicitud;
 * Mony completa número, categoría, becas y método de pago. Si a alguien le falta algo, no se
 * aprueba nada (422) y la transacción se deshace entera.
 */
export async function aprobarSolicitud(
  db: Ejecutor,
  id: string,
  pedido: z.output<typeof aprobarRequest>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await filaSolicitud(tx, id, true);
    const m = await miembros(tx, id);
    const sonJugadores = new Set(m.jugadoresIds);
    const sonApoderados = new Set(m.apoderadosIds);
    const cats = await cargarCategorias(tx);

    for (const pj of pedido.jugadores) {
      if (!sonJugadores.has(pj.id)) throw fueraDeLaSolicitud();
      const [j] = await tx
        .select({
          estado: jugadores.estado,
          disciplina: jugadores.disciplina,
          nombre: jugadores.nombre,
          apellido: jugadores.apellido,
          fecha_nacimiento: jugadores.fecha_nacimiento,
          telefono: jugadores.telefono,
          foto_id: jugadores.foto_id,
          tiene_apoderado: tieneApoderadoVigente,
        })
        .from(jugadores)
        .where(eq(jugadores.id, pj.id))
        .for("update");
      if (!j || j.estado !== "pendiente") throw fueraDeLaSolicitud();
      if (pj.categoria_id !== null) await verificarCategoria(tx, pj.categoria_id, j.disciplina);
      const faltan = requisitosJugador(
        faltantesJugador(
          { ...j, categoria_id: pj.categoria_id, numero_camiseta: pj.numero_camiseta },
          j.tiene_apoderado,
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

    for (const pa of pedido.apoderados) {
      if (!sonApoderados.has(pa.id)) throw fueraDeLaSolicitud();
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

    for (const pv of pedido.vinculos) {
      // Un vínculo hacia un jugador que ya existía (de otra solicitud o de la base) y que está
      // inactivo o rechazado no se aprueba: primero se decide sobre el jugador, en su ficha.
      const [jv] = await tx
        .select({ estado: jugadores.estado, solicitud_id: jugadores.solicitud_id })
        .from(jugadores)
        .where(eq(jugadores.id, pv.jugador_id));
      if (jv && jv.solicitud_id !== id && (jv.estado === "inactivo" || jv.estado === "rechazado")) {
        throw new ErrorApi(
          409,
          "conflicto",
          `El jugador de ese vínculo está ${jv.estado}: reactívalo en su ficha antes de aprobar el vínculo`,
        );
      }
      const filas = await tx
        .update(jugadorApoderado)
        .set({ estado: "activo" })
        .where(
          and(
            eq(jugadorApoderado.jugador_id, pv.jugador_id),
            eq(jugadorApoderado.apoderado_id, pv.apoderado_id),
            eq(jugadorApoderado.solicitud_id, id),
            eq(jugadorApoderado.estado, "pendiente"),
          ),
        )
        .returning({ jugador_id: jugadorApoderado.jugador_id });
      if (filas.length === 0) throw fueraDeLaSolicitud();
    }

    await cerrarSiCorresponde(tx, id);
    await cerrarRelacionadas(
      tx,
      id,
      pedido.jugadores.map((j) => j.id),
      pedido.apoderados.map((a) => a.id),
    );
  });
}

/**
 * Rechaza a las personas indicadas, o a todo lo pendiente de la solicitud. Una persona
 * rechazada queda sin credencial, y los vínculos pendientes que la solicitud creó para ella
 * se borran: no se aprobó a nadie con quien vincularla.
 */
export async function rechazarSolicitud(
  db: Ejecutor,
  id: string,
  pedido: z.output<typeof rechazarRequest>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await filaSolicitud(tx, id, true);
    const m = await miembros(tx, id);
    let jugadoresRech: string[];
    let apoderadosRech: string[];
    if (pedido.personas) {
      jugadoresRech = [...new Set(pedido.personas.filter((p) => p.rol === "jugador").map((p) => p.id))];
      apoderadosRech = [...new Set(pedido.personas.filter((p) => p.rol === "apoderado").map((p) => p.id))];
      if (jugadoresRech.some((j) => !m.jugadoresIds.includes(j))) throw fueraDeLaSolicitud();
      if (apoderadosRech.some((a) => !m.apoderadosIds.includes(a))) throw fueraDeLaSolicitud();
    } else {
      jugadoresRech = m.jugadoresIds;
      apoderadosRech = m.apoderadosIds;
    }
    const cambio = { estado: "rechazado" as const, credencial_token: null };
    const rechJ =
      jugadoresRech.length === 0
        ? []
        : await tx
            .update(jugadores)
            .set(cambio)
            .where(and(inArray(jugadores.id, jugadoresRech), eq(jugadores.estado, "pendiente")))
            .returning({ id: jugadores.id });
    const rechA =
      apoderadosRech.length === 0
        ? []
        : await tx
            .update(apoderados)
            .set(cambio)
            .where(and(inArray(apoderados.id, apoderadosRech), eq(apoderados.estado, "pendiente")))
            .returning({ id: apoderados.id });
    // Pedir el rechazo de alguien que no está pendiente es un error (ya aprobado, por ejemplo).
    if (pedido.personas && rechJ.length + rechA.length !== jugadoresRech.length + apoderadosRech.length) {
      throw fueraDeLaSolicitud();
    }
    const idsJ = pedido.personas ? jugadoresRech : rechJ.map((j) => j.id);
    const idsA = pedido.personas ? apoderadosRech : rechA.map((a) => a.id);
    const condicionPersonas = pedido.personas
      ? or(
          idsJ.length > 0 ? inArray(jugadorApoderado.jugador_id, idsJ) : undefined,
          idsA.length > 0 ? inArray(jugadorApoderado.apoderado_id, idsA) : undefined,
        )
      : undefined;
    // Sin `personas`, se rechaza todo: también los vínculos pendientes de personas que ya
    // existían (un hijo de otra familia nombrado por RUT).
    if (!pedido.personas || condicionPersonas) {
      await tx
        .delete(jugadorApoderado)
        .where(
          and(
            eq(jugadorApoderado.solicitud_id, id),
            eq(jugadorApoderado.estado, "pendiente"),
            condicionPersonas,
          ),
        );
    }
    await cerrarSiCorresponde(tx, id);
    await cerrarRelacionadas(
      tx,
      id,
      rechJ.map((j) => j.id),
      rechA.map((a) => a.id),
    );
  });
}

/**
 * Link privado nuevo: `/familia/:token` en una solicitud de formulario, `/completar/:token` en
 * una de segundo apoderado. La base guarda solo el hash, así que el anterior deja de servir.
 */
export async function nuevoLink(db: Ejecutor, id: string, baseUrl: string): Promise<string> {
  const s = await filaSolicitud(db, id);
  const token = generarToken();
  await db
    .update(solicitudesRegistro)
    .set({ token_acceso_hash: hashToken(token) })
    .where(eq(solicitudesRegistro.id, id));
  const ruta = s.tipo === "segundo_apoderado" ? "completar" : "familia";
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/${ruta}/${encodeURIComponent(token)}`;
}
