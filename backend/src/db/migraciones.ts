import { setTimeout as esperar } from "node:timers/promises";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { crearDb } from "./cliente";

/** Llave del candado de Postgres que serializa las migraciones (dos arranques a la vez). */
export const CANDADO_MIGRACIONES = 72_617_001;

/**
 * Aplica las migraciones pendientes de `carpeta` (backend/migrations). Drizzle las corre en
 * una sola transacción: si una falla, no queda ninguna a medias y la promesa se rechaza.
 * Usa su propia conexión y un candado de Postgres, así dos procesos que arrancan a la vez
 * (un despliegue que se superpone con el anterior) no las aplican dos veces. Si el candado
 * sigue tomado después de `plazoMs`, falla con un error claro en vez de esperar para siempre.
 */
export async function aplicarMigraciones(
  url: string,
  carpeta: string,
  { plazoMs = 120_000 }: { plazoMs?: number } = {},
): Promise<void> {
  const { db, cerrar } = crearDb(url, { max: 1 });
  try {
    const limite = Date.now() + plazoMs;
    for (;;) {
      const filas = await db.execute<{ ok: boolean }>(
        sql`select pg_try_advisory_lock(${CANDADO_MIGRACIONES}) as ok`,
      );
      if (filas[0]?.ok) break;
      if (Date.now() >= limite) {
        throw new Error("Otro proceso tiene tomado el candado de migraciones");
      }
      await esperar(Math.min(500, plazoMs));
    }
    try {
      await migrate(db, { migrationsFolder: carpeta });
    } finally {
      // Si esto falla, que no tape el error original: al cerrar la conexión se suelta igual.
      await db.execute(sql`select pg_advisory_unlock(${CANDADO_MIGRACIONES})`).catch(() => {});
    }
  } finally {
    await cerrar();
  }
}
