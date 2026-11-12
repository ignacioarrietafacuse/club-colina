import type { entrenadorCrear, entrenadorDetalle, entrenadorPatch } from "@club-colina/shared";
import { asc, eq, type SQL } from "drizzle-orm";
import type { z } from "zod";
import type { Ejecutor } from "../../db/cliente";
import { entrenadores } from "../../db/schema";
import { noEncontrado } from "../../lib/errores";
import { guardarFoto } from "../../lib/fotos";
import { generarToken } from "../../lib/tokens";
import { conRestricciones } from "./errores-db";

type EntrenadorDetalle = z.input<typeof entrenadorDetalle>;

function seleccionar(db: Ejecutor, donde?: SQL) {
  return db
    .select({
      id: entrenadores.id,
      nombre: entrenadores.nombre,
      apellido: entrenadores.apellido,
      rut: entrenadores.rut,
      telefono: entrenadores.telefono,
      disciplina: entrenadores.disciplina,
      foto_id: entrenadores.foto_id,
      credencial_token: entrenadores.credencial_token,
      estado: entrenadores.estado,
      creado_en: entrenadores.creado_en,
      actualizado_en: entrenadores.actualizado_en,
    })
    .from(entrenadores)
    .where(donde)
    .orderBy(asc(entrenadores.apellido), asc(entrenadores.nombre), asc(entrenadores.id));
}

function aDetalle(f: Awaited<ReturnType<typeof seleccionar>>[number]): EntrenadorDetalle {
  return {
    id: f.id,
    nombre: f.nombre,
    apellido: f.apellido,
    rut: f.rut,
    telefono: f.telefono,
    disciplina: f.disciplina,
    tiene_foto: f.foto_id !== null,
    credencial_token: f.credencial_token,
    estado: f.estado,
    creado_en: f.creado_en.toISOString(),
    actualizado_en: f.actualizado_en.toISOString(),
  };
}

export async function listarEntrenadores(db: Ejecutor): Promise<EntrenadorDetalle[]> {
  return (await seleccionar(db)).map(aDetalle);
}

export async function detalleEntrenador(db: Ejecutor, id: string): Promise<EntrenadorDetalle> {
  const [f] = await seleccionar(db, eq(entrenadores.id, id));
  if (!f) throw noEncontrado();
  return aDetalle(f);
}

/** Lo crea Mony con su foto: queda activo de inmediato, con su credencial. */
export async function crearEntrenador(
  db: Ejecutor,
  datos: z.output<typeof entrenadorCrear>,
  foto: Buffer,
): Promise<string> {
  return db.transaction(async (tx) => {
    const fotoId = await guardarFoto(tx, foto);
    const [fila] = await conRestricciones(() =>
      tx
        .insert(entrenadores)
        .values({ ...datos, foto_id: fotoId, estado: "activo", credencial_token: generarToken() })
        .returning({ id: entrenadores.id }),
    );
    if (!fila) throw new Error("No se pudo crear el entrenador");
    return fila.id;
  });
}

export async function editarEntrenador(
  db: Ejecutor,
  id: string,
  cambios: z.output<typeof entrenadorPatch>,
): Promise<void> {
  if (Object.keys(cambios).length === 0) {
    await detalleEntrenador(db, id);
    return;
  }
  const filas = await conRestricciones(() =>
    db.update(entrenadores).set(cambios).where(eq(entrenadores.id, id)).returning({ id: entrenadores.id }),
  );
  if (filas.length === 0) throw noEncontrado();
}
