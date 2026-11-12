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
import { apoderados, categorias, jugadorApoderado, jugadores } from "../../db/schema";
import { ErrorApi, noEncontrado } from "../../lib/errores";
import { conRestricciones } from "./errores-db";
import {
  calcularEdad,
  faltantesApoderado,
  faltantesJugador,
  hoyEnChile,
  nombreCompleto,
  requisitosJugador,
  type CategoriaRegla,
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

/** Máximo de un smallint de Postgres (`categorias.id`). */
const SMALLINT_MAX = 32767;

// ---------------------------------------------------------------------------
// Jugadores
// ---------------------------------------------------------------------------

/**
 * Si el jugador tiene un apoderado vigente: un vínculo con un apoderado precargado, pendiente o
 * activo (lista de permitidos: un estado nuevo no cuenta hasta decidirlo). Un apoderado rechazado o dado de baja no sirve de contacto, así que entonces el
 * jugador adulto necesita su propio teléfono.
 */
// Escrito con alias explícitos: drizzle no califica las columnas cuando la consulta tiene una
// sola tabla, y en la subconsulta "estado" o "id" serían ambiguos.
export const tieneApoderadoVigente = sql<boolean>`exists (select 1 from jugador_apoderado ja inner join apoderados a on a.id = ja.apoderado_id where ja.jugador_id = ${sql.raw('"jugadores"."id"')} and a.estado in ('precargado', 'pendiente', 'activo'))`;

/** Las categorías, para calcular la que corresponde por año. Son una decena de filas. */
export function cargarCategorias(db: Ejecutor): Promise<CategoriaRegla[]> {
  return db
    .select({
      id: categorias.id,
      disciplina: categorias.disciplina,
      anio_desde: categorias.anio_desde,
      anio_hasta: categorias.anio_hasta,
      se_calcula: categorias.se_calcula,
    })
    .from(categorias);
}

const columnasJugador = {
  id: jugadores.id,
  nombre: jugadores.nombre,
  apellido: jugadores.apellido,
  rut: jugadores.rut,
  fecha_nacimiento: jugadores.fecha_nacimiento,
  disciplina: jugadores.disciplina,
  categoria_id: jugadores.categoria_id,
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

function resumenJugador(f: FilaJugador, cats: readonly CategoriaRegla[], hoy: string): JugadorResumen {
  return {
    id: f.id,
    nombre: f.nombre,
    apellido: f.apellido,
    rut: f.rut,
    disciplina: f.disciplina,
    categoria_id: f.categoria_id,
    numero_camiseta: f.numero_camiseta,
    estado: f.estado,
    origen: f.origen,
    tiene_foto: f.foto_id !== null,
    faltan_datos: faltantesJugador(f, f.tiene_apoderado, cats, hoy).length > 0,
    marcado_retiro_en: f.marcado_retiro_en ? fechaHora(f.marcado_retiro_en) : null,
  };
}

export async function listarJugadores(
  db: Ejecutor,
  filtros: z.output<typeof jugadoresQuery>,
): Promise<JugadorResumen[]> {
  const condiciones: SQL[] = [];
  if (filtros.estado) condiciones.push(eq(jugadores.estado, filtros.estado));
  if (filtros.disciplina) condiciones.push(eq(jugadores.disciplina, filtros.disciplina));
  if (filtros.categoria_id !== undefined) {
    // categorias.id es smallint: un número más grande no existe (y Postgres respondería 22003).
    if (filtros.categoria_id > SMALLINT_MAX) return [];
    condiciones.push(eq(jugadores.categoria_id, filtros.categoria_id));
  }
  if (filtros.sin_numero === true) condiciones.push(eq(jugadores.numero_camiseta, NUMERO_SIN_ASIGNAR));
  if (filtros.sin_numero === false) {
    condiciones.push(sql`${jugadores.numero_camiseta} is distinct from ${NUMERO_SIN_ASIGNAR}`);
  }
  if (filtros.q) {
    const busqueda = or(
      ilike(sql`coalesce(${jugadores.nombre}, '') || ' ' || coalesce(${jugadores.apellido}, '')`, patronBusqueda(filtros.q)),
      ilike(jugadores.rut, patronBusqueda(textoRut(filtros.q))),
    );
    if (busqueda) condiciones.push(busqueda);
  }
  const hoy = hoyEnChile();
  const cats = await cargarCategorias(db);
  const filas = await seleccionarJugadores(db, and(...condiciones));
  // "Faltan datos" depende de la edad y de los vínculos: se calcula acá. Son unos cientos de filas.
  return filas
    .map((f) => resumenJugador(f, cats, hoy))
    .filter((j) => filtros.faltan_datos === undefined || j.faltan_datos === filtros.faltan_datos);
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
  const hoy = hoyEnChile();
  const cats = await cargarCategorias(db);
  return {
    ...resumenJugador(f, cats, hoy),
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
    faltantes: faltantesJugador(f, f.tiene_apoderado, cats, hoy),
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

/** La categoría tiene que ser de la misma rama que el jugador. */
export async function verificarCategoria(db: Ejecutor, categoriaId: number, disciplina: string): Promise<void> {
  if (categoriaId > SMALLINT_MAX) throw new ErrorApi(400, "validacion", "Datos inválidos: categoria_id");
  const [c] = await db
    .select({ disciplina: categorias.disciplina })
    .from(categorias)
    .where(eq(categorias.id, categoriaId));
  if (!c || c.disciplina !== disciplina) {
    throw new ErrorApi(400, "validacion", "Datos inválidos: categoria_id");
  }
}

export async function editarJugador(
  db: Ejecutor,
  id: string,
  cambios: z.output<typeof jugadorPatch>,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [actual] = await tx
      .select({ disciplina: jugadores.disciplina, categoria_id: jugadores.categoria_id })
      .from(jugadores)
      .where(eq(jugadores.id, id))
      .for("update");
    if (!actual) throw noEncontrado();
    const disciplina = cambios.disciplina ?? actual.disciplina;
    const categoria = cambios.categoria_id === undefined ? actual.categoria_id : cambios.categoria_id;
    // Cambiar de rama sin cambiar la categoría la deja en la rama equivocada: se exige corregirla.
    const tocaRama = cambios.disciplina !== undefined || cambios.categoria_id !== undefined;
    if (tocaRama && categoria !== null) await verificarCategoria(tx, categoria, disciplina);
    if (Object.keys(cambios).length === 0) return;
    const cats = await cargarCategorias(tx);
    const [antes] = await seleccionarJugadores(tx, eq(jugadores.id, id));
    const faltabanAntes = new Set(antes ? requisitosJugador(faltantesJugador(antes, antes.tiene_apoderado, cats)) : []);
    await conRestricciones(() => tx.update(jugadores).set(cambios).where(eq(jugadores.id, id)));
    // La base cubre casi todo con sus CHECK, pero no el teléfono del adulto sin apoderado: un
    // activo no puede quedar con menos de lo que se le exigió para activarlo.
    const [despues] = await seleccionarJugadores(tx, eq(jugadores.id, id));
    if (despues?.estado === "activo") {
      // Solo se rechaza lo que este PATCH empeora: si ya faltaba algo por otra causa (se dio de baja
      // a su apoderado), Mony puede seguir editando lo demás.
      const faltan = requisitosJugador(faltantesJugador(despues, despues.tiene_apoderado, cats)).filter(
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
