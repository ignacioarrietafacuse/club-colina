import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { crearDb } from "../db/cliente";
import { aplicarMigraciones } from "../db/migraciones";
import { urlTest } from "./db";

/** Deja la base de tests vacía y con todas las migraciones aplicadas. */
export default async function setup() {
  const { db, cerrar } = crearDb(urlTest(), { max: 1 });
  try {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`create schema public`);
  } finally {
    await cerrar();
  }
  // El mismo camino que usa el servidor al arrancar.
  await aplicarMigraciones(urlTest(), fileURLToPath(new URL("../../migrations", import.meta.url)));
}
