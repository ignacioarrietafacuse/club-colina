/**
 * Datos ficticios para los tests de registro. Nombres inventados y RUT de
 * `generarRutFicticio()`; nunca datos reales. Solo lo importan los tests.
 */
import { generarRutFicticio } from "@club-colina/shared";
import { sql } from "drizzle-orm";
import type { Ejecutor } from "../../db/cliente";
import { apoderados, jugadorApoderado, jugadores } from "../../db/schema";

let semilla = 5000;
export function rutNuevo(): string {
  semilla += 1;
  return generarRutFicticio(semilla);
}

/** Vacía las tablas de personas y solicitudes. Las categorías (seed) se conservan. */
export async function vaciarRegistro(db: Ejecutor) {
  await db.execute(
    sql`truncate jugador_apoderado, jugadores, apoderados, entrenadores, solicitudes_registro, fotos, sesiones, usuarios cascade`,
  );
}

export async function crearApoderado(db: Ejecutor, extra: Partial<typeof apoderados.$inferInsert> = {}) {
  const [a] = await db
    .insert(apoderados)
    .values({
      nombre: "Rosa",
      apellido: "Ficticia",
      rut: rutNuevo(),
      telefono: "911111111",
      origen: "base_2026",
      ...extra,
    })
    .returning();
  if (!a) throw new Error("no se creó el apoderado");
  return a;
}

export async function crearJugador(db: Ejecutor, extra: Partial<typeof jugadores.$inferInsert> = {}) {
  const [j] = await db
    .insert(jugadores)
    .values({
      nombre: "Tomás Andrés",
      apellido: "Inventado",
      rut: rutNuevo(),
      fecha_nacimiento: "2014-05-10",
      disciplina: "basketball",
      origen: "base_2026",
      ...extra,
    })
    .returning();
  if (!j) throw new Error("no se creó el jugador");
  return j;
}

export async function vincular(
  db: Ejecutor,
  jugadorId: string,
  apoderadoId: string,
  extra: Partial<typeof jugadorApoderado.$inferInsert> = {},
) {
  await db
    .insert(jugadorApoderado)
    .values({ jugador_id: jugadorId, apoderado_id: apoderadoId, paga_mensualidad: true, estado: "activo", ...extra });
}
