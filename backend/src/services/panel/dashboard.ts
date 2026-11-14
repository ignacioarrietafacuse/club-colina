import type { categoriaPanel, dashboardResponse } from "@club-colina/shared";
import { asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Ejecutor } from "../../db/cliente";
import { apoderados, categorias, entrenadores, jugadores, solicitudesRegistro } from "../../db/schema";
import { cargarCategorias, categoriaDelJugador } from "../../lib/categorias";
import { marcadoSinResolver } from "./personas";

/** Números reales del dashboard, en una sola consulta. */
export async function resumenDashboard(db: Ejecutor): Promise<z.output<typeof dashboardResponse>> {
  const filas = await db.execute<{
    jugadores_activos: number;
    apoderados_activos: number;
    entrenadores_activos: number;
    solicitudes_pendientes: number;
    jugadores_marcados: number;
    jugadores_precargados: number;
    apoderados_precargados: number;
  }>(sql`
    select
      (select count(*) from ${jugadores} where ${jugadores.estado} = 'activo')::int as jugadores_activos,
      (select count(*) from ${apoderados} where ${apoderados.estado} = 'activo')::int as apoderados_activos,
      (select count(*) from ${entrenadores} where ${entrenadores.estado} = 'activo')::int as entrenadores_activos,
      (select count(*) from ${solicitudesRegistro} where ${solicitudesRegistro.estado} = 'pendiente')::int as solicitudes_pendientes,
      (select count(*) from ${jugadores} where ${marcadoSinResolver})::int as jugadores_marcados,
      (select count(*) from ${jugadores} where ${jugadores.estado} = 'precargado')::int as jugadores_precargados,
      (select count(*) from ${apoderados} where ${apoderados.estado} = 'precargado')::int as apoderados_precargados
  `);
  const f = filas[0];
  if (!f) throw new Error("El dashboard no devolvió filas");
  return {
    jugadores_por_categoria: await jugadoresPorCategoria(db),
    jugadores_activos: f.jugadores_activos,
    apoderados_activos: f.apoderados_activos,
    entrenadores_activos: f.entrenadores_activos,
    solicitudes_pendientes: f.solicitudes_pendientes,
    jugadores_marcados_ya_no_esta: f.jugadores_marcados,
    precargados_sin_registrar: { jugadores: f.jugadores_precargados, apoderados: f.apoderados_precargados },
  };
}

/**
 * Jugadores activos por categoría, calculada hoy (cambia sola el 1 de enero). Todas las
 * categorías, en el orden del panel, aunque tengan 0, y al final los que quedan sin categoría.
 */
async function jugadoresPorCategoria(db: Ejecutor): Promise<{ categoria_id: number | null; jugadores: number }[]> {
  const cats = await cargarCategorias(db);
  const activos = await db
    .select({
      fecha_nacimiento: jugadores.fecha_nacimiento,
      disciplina: jugadores.disciplina,
      u11f_temporada: jugadores.u11f_temporada,
    })
    .from(jugadores)
    .where(eq(jugadores.estado, "activo"));
  const ahora = new Date();
  const cuenta = new Map<number | null, number>();
  for (const j of activos) {
    const c = categoriaDelJugador(j, cats, ahora);
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }
  const orden = await listarCategorias(db);
  return [
    ...orden.map((c) => ({ categoria_id: c.id, jugadores: cuenta.get(c.id) ?? 0 })),
    { categoria_id: null, jugadores: cuenta.get(null) ?? 0 },
  ];
}

export async function listarCategorias(db: Ejecutor): Promise<z.input<typeof categoriaPanel>[]> {
  return db
    .select({
      id: categorias.id,
      nombre: categorias.nombre,
      disciplina: categorias.disciplina,
      edad_min: categorias.edad_min,
      edad_max: categorias.edad_max,
      se_calcula: categorias.se_calcula,
    })
    .from(categorias)
    .orderBy(asc(categorias.disciplina), asc(categorias.edad_min), asc(categorias.id));
}
