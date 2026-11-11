import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { generarRutFicticio } from "@club-colina/shared";
import { dbTest, JPEG_PRUEBA } from "../test/db";
import { borrarFoto, guardarFoto } from "../lib/fotos";
import { generarToken } from "../lib/tokens";
import { apoderados, categorias, entrenadores, jugadores } from "./schema";

const { db, cerrar } = dbTest();
afterAll(cerrar);

describe("esquema y migraciones", () => {
  it("trae las 11 categorías del diseño; U11 F no se calcula", async () => {
    const filas = await db.select().from(categorias);
    expect(filas).toHaveLength(11);
    expect(filas.filter((c) => c.disciplina === "basketball")).toHaveLength(7);
    expect(filas.find((c) => c.nombre === "U11 F")?.se_calcula).toBe(false);
    expect(filas.find((c) => c.nombre === "U21")).toMatchObject({ anio_desde: 2005, anio_hasta: 2008 });
  });

  it("un jugador precargado puede venir incompleto", async () => {
    const [j] = await db
      .insert(jugadores)
      .values({ rut: generarRutFicticio(101), disciplina: "voleibol", origen: "base_2026" })
      .returning();
    expect(j?.estado).toBe("precargado");
    expect(j?.numero_camiseta).toBeNull();
  });

  it("no deja activo a nadie sin foto ni token", async () => {
    await expect(
      db.insert(apoderados).values({
        rut: generarRutFicticio(102),
        nombre: "Ana",
        apellido: "Prueba",
        telefono: "912345678",
        estado: "activo",
        origen: "formulario",
      }),
    ).rejects.toThrow();
  });

  it("valida RUT, número, becas y duplicados", async () => {
    const rut = generarRutFicticio(103);
    await expect(
      db.insert(jugadores).values({ rut: "12.345.678-5", disciplina: "basketball", origen: "formulario" }),
    ).rejects.toThrow();
    await expect(
      db.insert(jugadores).values({ rut, disciplina: "basketball", origen: "formulario", numero_camiseta: "100" }),
    ).rejects.toThrow();
    await expect(
      db.insert(jugadores).values({ rut, disciplina: "basketball", origen: "formulario", beca_torneos_pct: 101 }),
    ).rejects.toThrow();
    await db.insert(jugadores).values({ rut, disciplina: "basketball", origen: "formulario", numero_camiseta: "00" });
    await expect(
      db.insert(jugadores).values({ rut, disciplina: "basketball", origen: "formulario" }),
    ).rejects.toThrow();
  });

  it("un entrenador activo con foto y token; la foto en uso no se puede borrar", async () => {
    const foto_id = await guardarFoto(db, JPEG_PRUEBA);
    const [e] = await db
      .insert(entrenadores)
      .values({
        nombre: "Pedro",
        apellido: "Prueba",
        rut: generarRutFicticio(104),
        telefono: "987654321",
        disciplina: "basketball",
        foto_id,
        credencial_token: generarToken(),
      })
      .returning();
    expect(e?.estado).toBe("activo");
    await expect(borrarFoto(db, foto_id)).rejects.toThrow();
    await db.delete(entrenadores).where(eq(entrenadores.foto_id, foto_id));
    expect(await borrarFoto(db, foto_id)).toBe(true);
  });
});
