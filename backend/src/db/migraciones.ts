import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { crearDb } from "./cliente";

/** Llave del candado de Postgres que serializa las migraciones (dos arranques a la vez). */
const CANDADO_MIGRACIONES = 72_617_001;

/**
 * Aplica las migraciones pendientes de `carpeta` (backend/migrations). Drizzle las corre en
 * una sola transacción: si una falla, no queda ninguna a medias y la promesa se rechaza.
 * Usa su propia conexión y un candado de Postgres, así dos procesos que arrancan a la vez
 * (un despliegue que se superpone con el anterior) no las aplican dos veces.
 */
export async function aplicarMigraciones(url: string, carpeta: string): Promise<void> {
  const { db, cerrar } = crearDb(url, { max: 1 });
  try {
    await db.execute(sql`select pg_advisory_lock(${CANDADO_MIGRACIONES})`);
    try {
      await migrate(db, { migrationsFolder: carpeta });
    } finally {
      await db.execute(sql`select pg_advisory_unlock(${CANDADO_MIGRACIONES})`);
    }
  } finally {
    await cerrar();
  }
}
