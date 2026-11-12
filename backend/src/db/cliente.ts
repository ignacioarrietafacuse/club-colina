import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
/** Base o transacción: lo que reciben los módulos que escriben. */
export type Ejecutor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export function crearDb(url: string, opciones: { max?: number } = {}) {
  const sql = postgres(url, {
    max: opciones.max ?? 10,
    connect_timeout: 10,
    idle_timeout: 30,
    // Los avisos de Postgres (NOTICE) no van a la salida estándar.
    onnotice: () => {},
  });
  const db: Db = drizzle(sql, { schema });
  return { db, cerrar: () => sql.end({ timeout: 5 }) };
}
