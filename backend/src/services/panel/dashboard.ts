import type { categoriaPanel, dashboardResponse } from "@club-colina/shared";
import { asc, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Ejecutor } from "../../db/cliente";
import { apoderados, categorias, entrenadores, jugadores, solicitudesRegistro } from "../../db/schema";

/** Números reales del dashboard, en una sola consulta. */
export async function resumenDashboard(db: Ejecutor): Promise<z.input<typeof dashboardResponse>> {
  const filas = await db.execute<{
    jugadores_activos: number;
    apoderados_activos: number;
    entrenadores_activos: number;
    solicitudes_pendientes: number;
    jugadores_precargados: number;
    apoderados_precargados: number;
  }>(sql`
    select
      (select count(*) from ${jugadores} where ${jugadores.estado} = 'activo')::int as jugadores_activos,
      (select count(*) from ${apoderados} where ${apoderados.estado} = 'activo')::int as apoderados_activos,
      (select count(*) from ${entrenadores} where ${entrenadores.estado} = 'activo')::int as entrenadores_activos,
      (select count(*) from ${solicitudesRegistro} where ${solicitudesRegistro.estado} = 'pendiente')::int as solicitudes_pendientes,
      (select count(*) from ${jugadores} where ${jugadores.estado} = 'precargado')::int as jugadores_precargados,
      (select count(*) from ${apoderados} where ${apoderados.estado} = 'precargado')::int as apoderados_precargados
  `);
  const f = filas[0];
  if (!f) throw new Error("El dashboard no devolvió filas");
  return {
    jugadores_activos: f.jugadores_activos,
    apoderados_activos: f.apoderados_activos,
    entrenadores_activos: f.entrenadores_activos,
    solicitudes_pendientes: f.solicitudes_pendientes,
    precargados_sin_registrar: { jugadores: f.jugadores_precargados, apoderados: f.apoderados_precargados },
  };
}

export async function listarCategorias(db: Ejecutor): Promise<z.input<typeof categoriaPanel>[]> {
  return db
    .select({
      id: categorias.id,
      nombre: categorias.nombre,
      disciplina: categorias.disciplina,
      anio_desde: categorias.anio_desde,
      anio_hasta: categorias.anio_hasta,
      se_calcula: categorias.se_calcula,
    })
    .from(categorias)
    .orderBy(asc(categorias.disciplina), asc(categorias.anio_hasta), asc(categorias.id));
}
