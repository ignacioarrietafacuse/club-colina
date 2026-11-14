import {
  NUMERO_SIN_ASIGNAR,
  type apoderadoDetalle,
  type apoderadoPatch,
  type apoderadoResumen,
  type apoderadosQuery,
  type jugadorDetalle,
  type jugadorPatch,
  type jugadorResumen,
  type jugadoresQuery,
} from "@club-colina/shared";
import { and, asc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type { Ejecutor } from "../../db/cliente";
import { apoderados, jugadorApoderado, jugadores } from "../../db/schema";
import { cargarCategorias, categoriaDelJugador, type CategoriaRegla, temporada } from "../../lib/categorias";
import { ErrorApi, noEncontrado } from "../../lib/errores";
import { conRestricciones } from "./errores-db";
import {
  calcularEdad,
  faltantesApoderado,
  faltantesJugador,
  hoyEnChile,
  nombreCompleto,
} from "./reglas";

type JugadorResumen = z.input<typeof jugadorResumen>;
type JugadorDetalle = z.input<typeof jugadorDetalle>;
type ApoderadoResumen = z.input<typeof apoderadoResumen>;
type ApoderadoDetalle = z.input<typeof apoderadoDetalle>;

/** Patrón para ILIKE con el texto del buscador; `%` y `_` se buscan literalmente. */
function patronBusqueda(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** El RUT se guarda sin puntos: "12.345.678-5" tiene que encontrar "12345678-5". */
function textoRut(q: string): string {
  return q.replace(/\./g, "").toUpperCase();
}

const fechaHora = (d: Date) => d.toISOString();

// ---------------------------------------------------------------------------
// Jugadores
// ---------------------------------------------------------------------------

/**
 * Si el jugador tiene un apoderado vigente: un apoderado **activo** con un vínculo **activo**
 * (decisión de Ignacio, 2026-11-12: un pendiente no cuenta). Un apoderado precargado o pendiente,
 * o un vínculo que Mony todavía no aprobó, no están verificados, y un apoderado rechazado o dado
 * de baja no sirve de contacto: en esos casos el jugador adulto necesita su propio teléfono.
 */
// Escrito con alias explícitos: drizzle no califica las columnas cuando la consulta tiene una
// sola tabla, y en la subconsulta "estado" o "id" serían ambiguos.
export const tieneApoderadoVigente = sql<boolean>`exists (select 1 from jugador_apoderado ja inner join apoderados a on a.id = ja.apoderado_id where ja.jugador_id = ${sql.raw('"jugadores"."id"')} and a.estado = 'activo' and ja.estado = 'activo')`;

const columnasJugador = {
  id: jugadores.id,
  nombre: jugadores.nombre,
  apellido: jugadores.apellido,
  rut: jugadores.rut,
  fecha_nacimiento: jugadores.fecha_nacimiento,
  disciplina: jugadores.disciplina,
  u11f_temporada: jugadores.u11f_temporada,
  numero_camiseta: jugadores.numero_camiseta,
  postula_beca: jugadores.postula_beca,
  beca_mensualidad_pct: jugadores.beca_mensualidad_pct,
  beca_torneos_pct: jugadores.beca_torneos_pct,
  beca_campus_pct: jugadores.beca_campus_pct,
  telefono: jugadores.telefono,
  email: jugadores.email,
  metodo_pago: jugadores.metodo_pago,
  marcado_retiro_en: jugadores.marcado_retiro_en,
  foto_id: jugadores.foto_id,
  credencial_token: jugadores.credencial_token,
  estado: jugadores.estado,
  origen: jugadores.origen,
  solicitud_id: jugadores.solicitud_id,
  creado_en: jugadores.creado_en,
  actualizado_en: jugadores.actualizado_en,
  tiene_apoderado: tieneApoderadoVigente,
};

type FilaJugador = Awaited<ReturnType<typeof seleccionarJugadores>>[number];

function seleccionarJugadores(db: Ejecutor, donde?: SQL) {
  return db
    .select(columnasJugador)
    .from(jugadores)
    .where(donde)
    .orderBy(asc(jugadores.apellido), asc(jugadores.nombre), asc(jugadores.id));
}

/** La categoría se calcula siempre al responder (`lib/categorias.ts`): nunca se guarda. */
function resumenJugador(f: FilaJugador, cats: readonly CategoriaRegla[], ahora: Date): JugadorResumen {
  return {
    id: f.id,
    nombre: f.nombre,
    apellido: f.apellido,
    rut: f.rut,
    disciplina: f.disciplina,
    categoria_id: categoriaDelJugador(f, cats, ahora),
    numero_camiseta: f.numero_camiseta,
    estado: f.estado,
    origen: f.origen,
    tiene_foto: f.foto_id !== null,
    faltan_datos: faltantesJugador(f, f.tiene_apoderado, hoyEnChile(ahora)).length > 0,
    marcado_retiro_en: f.marcado_retiro_en ? fechaHora(f.marcado_retiro_en) : null,
  };
}

/**
 * Jugador marcado "ya no está en el club" que Mony todavía no resolvió: no lo dejó inactivo ni le
 * quitó la marca. El dashboard cuenta exactamente estos, y su enlace abre la lista con este filtro.
 */
export const marcadoSinResolver = sql`(${jugadores.marcado_retiro_en} is not null and ${jugadores.estado} in ('precargado', 'pendiente', 'activo'))`;

export async function listarJugadores(
  db: Ejecutor,
  filtros: z.output<typeof jugadoresQuery>,
): Promise<JugadorResumen[]> {
  const condiciones: SQL[] = [];
  if (filtros.estado) condiciones.push(eq(jugadores.estado, filtros.estado));
  if (filtros.disciplina) condiciones.push(eq(jugadores.disciplina, filtros.disciplina));
  if (filtros.sin_numero === true) condiciones.push(eq(jugadores.numero_camiseta, NUMERO_SIN_ASIGNAR));
  if (filtros.sin_numero === false) {
    condiciones.push(sql`${jugadores.numero_camiseta} is distinct from ${NUMERO_SIN_ASIGNAR}`);
  }
  if (filtros.marcado_ya_no_esta !== undefined) {
    condiciones.push(filtros.marcado_ya_no_esta ? marcadoSinResolver : sql`not (${marcadoSinResolver})`);
  }
  if (filtros.q) {
    const busqueda = or(
      ilike(sql`coalesce(${jugadores.nombre}, '') || ' ' || coalesce(${jugadores.apellido}, '')`, patronBusqueda(filtros.q)),
      ilike(jugadores.rut, patronBusqueda(textoRut(filtros.q))),
    );
    if (busqueda) condiciones.push(busqueda);
  }
  const ahora = new Date();
  const cats = await cargarCategorias(db);
  const filas = await seleccionarJugadores(db, and(...condiciones));
  // "Faltan datos" y la categoría dependen de la fecha de hoy (y "faltan datos", de los vínculos):
  // se calculan acá. Son unos cientos de filas.
  return filas
    .map((f) => resumenJugador(f, cats, ahora))
    .filter((j) => filtros.faltan_datos === undefined || j.faltan_datos === filtros.faltan_datos)
    .filter((j) => filtros.categoria_id === undefined || j.categoria_id === filtros.categoria_id)
    .filter((j) => filtros.sin_categoria === undefined || (j.categoria_id === null) === filtros.sin_categoria);
}

export async function detalleJugador(db: Ejecutor, id: string): Promise<JugadorDetalle> {
  const [f] = await seleccionarJugadores(db, eq(jugadores.id, id));
  if (!f) throw noEncontrado();
  const vinculos = await db
    .select({
      id: apoderados.id,
      nombre: apoderados.nombre,
      apellido: apoderados.apellido,
      paga_mensualidad: jugadorApoderado.paga_mensualidad,
      estado_vinculo: jugadorApoderado.estado,
    })
    .from(jugadorApoderado)
    .innerJoin(apoderados, eq(apoderados.id, jugadorApoderado.apoderado_id))
    .where(eq(jugadorApoderado.jugador_id, id))
    .orderBy(asc(jugadorApoderado.creado_en), asc(apoderados.id));
  const ahora = new Date();
  const hoy = hoyEnChile(ahora);
  const cats = await cargarCategorias(db);
  return {
    ...resumenJugador(f, cats, ahora),
    u11f: f.disciplina === "basketball" && f.u11f_temporada === temporada(ahora),
    fecha_nacimiento: f.fecha_nacimiento,
    edad: calcularEdad(f.fecha_nacimiento, hoy),
    postula_beca: f.postula_beca,
    beca_mensualidad_pct: f.beca_mensualidad_pct,
    beca_torneos_pct: f.beca_torneos_pct,
    beca_campus_pct: f.beca_campus_pct,
    telefono: f.telefono,
    email: f.email,
    metodo_pago: f.metodo_pago,
    credencial_token: f.credencial_token,
    solicitud_id: f.solicitud_id,
    faltantes: faltantesJugador(f, f.tiene_apoderado, hoy),
    apoderados: vinculos.map((v) => ({
      id: v.id,
      nombre_completo: nombreCompleto(v.nombre, v.apellido),
      paga_mensualidad: v.paga_mensualidad,
      estado_vinculo: v.estado_vinculo,
    })),
    creado_en: fechaHora(f.creado_en),
    actualizado_en: fechaHora(f.actualizado_en),
  };
}

export async function editarJugador(
  db: Ejecutor,
  id: string,
  cambios: z.output<typeof jugadorPatch>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [actual] = await tx
      .select({ disciplina: jugadores.disciplina })
      .from(jugadores)
      .where(eq(jugadores.id, id))
      .for("update");
    if (!actual) throw noEncontrado();
    const { u11f, ...datos } = cambios;
    const disciplina = datos.disciplina ?? actual.disciplina;
    // La marca U11 F vale solo en básquet y solo la temporada en que Mony la pone. Pasar a vóley
    // la borra, para que no reaparezca si vuelve a básquet en la misma temporada.
    if (u11f === true && disciplina !== "basketball") {
      throw new ErrorApi(400, "validacion", "Datos inválidos: u11f");
    }
    const marca =
      u11f !== undefined
        ? { u11f_temporada: u11f ? temporada() : null }
        : datos.disciplina !== undefined && datos.disciplina !== "basketball"
          ? { u11f_temporada: null }
          : {};
    const set = { ...datos, ...marca };
    if (Object.keys(cambios).length === 0) return;
    const [antes] = await seleccionarJugadores(tx, eq(jugadores.id, id));
    const faltabanAntes = new Set(antes ? faltantesJugador(antes, antes.tiene_apoderado) : []);
    await conRestricciones(() => tx.update(jugadores).set(set).where(eq(jugadores.id, id)));
    // La base cubre casi todo con sus CHECK, pero no el teléfono del adulto sin apoderado: un
    // activo no puede quedar con menos de lo que se le exigió para activarlo.
    const [despues] = await seleccionarJugadores(tx, eq(jugadores.id, id));
    if (despues?.estado === "activo") {
      // Solo se rechaza lo que este PATCH empeora: si ya faltaba algo por otra causa (se dio de baja
      // a su apoderado), Mony puede seguir editando lo demás.
      const faltan = faltantesJugador(despues, despues.tiene_apoderado).filter(
        (f) => !faltabanAntes.has(f),
      );
      if (faltan.length > 0) {
        throw new ErrorApi(422, "requisitos_incompletos", `Faltan datos: ${faltan.join(", ")}`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Apoderados
// ---------------------------------------------------------------------------

const columnasApoderado = {
  id: apoderados.id,
  nombre: apoderados.nombre,
  apellido: apoderados.apellido,
  rut: apoderados.rut,
  telefono: apoderados.telefono,
  email: apoderados.email,
  metodo_pago: apoderados.metodo_pago,
  foto_id: apoderados.foto_id,
  credencial_token: apoderados.credencial_token,
  estado: apoderados.estado,
  origen: apoderados.origen,
  solicitud_id: apoderados.solicitud_id,
  creado_en: apoderados.creado_en,
  actualizado_en: apoderados.actualizado_en,
};

type FilaApoderado = Awaited<ReturnType<typeof seleccionarApoderados>>[number];

function seleccionarApoderados(db: Ejecutor, donde?: SQL) {
  return db
    .select(columnasApoderado)
    .from(apoderados)
    .where(donde)
    .orderBy(asc(apoderados.apellido), asc(apoderados.nombre), asc(apoderados.id));
}

function resumenApoderado(f: FilaApoderado): ApoderadoResumen {
  return {
    id: f.id,
    nombre: f.nombre,
    apellido: f.apellido,
    rut: f.rut,
    telefono: f.telefono,
    estado: f.estado,
    origen: f.origen,
    tiene_foto: f.foto_id !== null,
    faltan_datos: faltantesApoderado(f).length > 0,
  };
}

export async function listarApoderados(
  db: Ejecutor,
  filtros: z.output<typeof apoderadosQuery>,
): Promise<ApoderadoResumen[]> {
  const condiciones: SQL[] = [];
  if (filtros.estado) condiciones.push(eq(apoderados.estado, filtros.estado));
  if (filtros.faltan_datos === true) {
    const incompleto = or(
      sql`${apoderados.nombre} is null`,
      sql`${apoderados.apellido} is null`,
      sql`${apoderados.telefono} is null`,
      sql`${apoderados.foto_id} is null`,
    );
    if (incompleto) condiciones.push(incompleto);
  }
  if (filtros.faltan_datos === false) {
    condiciones.push(
      isNotNull(apoderados.nombre),
      isNotNull(apoderados.apellido),
      isNotNull(apoderados.telefono),
      isNotNull(apoderados.foto_id),
    );
  }
  if (filtros.q) {
    const patron = patronBusqueda(filtros.q);
    const busqueda = or(
      ilike(sql`coalesce(${apoderados.nombre}, '') || ' ' || coalesce(${apoderados.apellido}, '')`, patron),
      ilike(apoderados.rut, patronBusqueda(textoRut(filtros.q))),
      ilike(sql`coalesce(${apoderados.telefono}, '')`, patron),
    );
    if (busqueda) condiciones.push(busqueda);
  }
  const filas = await seleccionarApoderados(db, and(...condiciones));
  return filas.map(resumenApoderado);
}

export async function detalleApoderado(db: Ejecutor, id: string): Promise<ApoderadoDetalle> {
  const [f] = await seleccionarApoderados(db, eq(apoderados.id, id));
  if (!f) throw noEncontrado();
  const vinculos = await db
    .select({
      id: jugadores.id,
      nombre: jugadores.nombre,
      apellido: jugadores.apellido,
      paga_mensualidad: jugadorApoderado.paga_mensualidad,
      estado_vinculo: jugadorApoderado.estado,
    })
    .from(jugadorApoderado)
    .innerJoin(jugadores, eq(jugadores.id, jugadorApoderado.jugador_id))
    .where(eq(jugadorApoderado.apoderado_id, id))
    .orderBy(asc(jugadorApoderado.creado_en), asc(jugadores.id));
  return {
    ...resumenApoderado(f),
    email: f.email,
    metodo_pago: f.metodo_pago,
    credencial_token: f.credencial_token,
    solicitud_id: f.solicitud_id,
    faltantes: faltantesApoderado(f),
    jugadores: vinculos.map((v) => ({
      id: v.id,
      nombre_completo: nombreCompleto(v.nombre, v.apellido),
      paga_mensualidad: v.paga_mensualidad,
      estado_vinculo: v.estado_vinculo,
    })),
    creado_en: fechaHora(f.creado_en),
    actualizado_en: fechaHora(f.actualizado_en),
  };
}

export async function editarApoderado(
  db: Ejecutor,
  id: string,
  cambios: z.output<typeof apoderadoPatch>,
): Promise<void> {
  if (Object.keys(cambios).length === 0) {
    const [existe] = await db.select({ id: apoderados.id }).from(apoderados).where(eq(apoderados.id, id));
    if (!existe) throw noEncontrado();
    return;
  }
  const filas = await conRestricciones(() =>
    db.update(apoderados).set(cambios).where(eq(apoderados.id, id)).returning({ id: apoderados.id }),
  );
  if (filas.length === 0) throw noEncontrado();
}
