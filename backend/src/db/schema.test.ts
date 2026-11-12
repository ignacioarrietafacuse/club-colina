import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { generarRutFicticio } from "@club-colina/shared";
import { dbTest, JPEG_PRUEBA } from "../test/db";
import { borrarFoto, guardarFoto } from "../lib/fotos";
import { generarToken, hashToken } from "../lib/tokens";
import { apoderados, categorias, entrenadores, fichasPrevias, jugadores, solicitudesRegistro } from "./schema";

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

  it("la solicitud guarda solo el hash del link y avisos conocidos", async () => {
    const base = { consentimiento_en: new Date() };
    await expect(
      db.insert(solicitudesRegistro).values({ ...base, token_acceso_hash: generarToken() }),
    ).rejects.toThrow();
    const [s] = await db
      .insert(solicitudesRegistro)
      .values({ ...base, token_acceso_hash: hashToken(generarToken()), avisos: ["titular_ya_registrado"] })
      .returning();
    expect(s?.avisos).toEqual(["titular_ya_registrado"]);
    // La solicitud de segundo apoderado apunta a la de formulario que lo agregó, y solo ella.
    const otro = { tipo: "segundo_apoderado" as const };
    await expect(
      db.insert(solicitudesRegistro).values({ ...otro, token_acceso_hash: hashToken(generarToken()) }),
    ).rejects.toThrow();
    await db
      .insert(solicitudesRegistro)
      .values({ ...otro, token_acceso_hash: hashToken(generarToken()), solicitud_origen_id: s?.id });
    await expect(
      db.insert(solicitudesRegistro).values({
        ...base,
        token_acceso_hash: hashToken(generarToken()),
        solicitud_origen_id: s?.id,
      }),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`insert into solicitudes_registro (token_acceso_hash, consentimiento_en, avisos)
            values (${hashToken(generarToken())}, now(), array['inventado'])`,
      ),
    ).rejects.toThrow();
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

  it("la solicitud tiene a lo más un titular, que tiene que existir", async () => {
    const base = { consentimiento_en: new Date() };
    const [apo] = await db
      .insert(apoderados)
      .values({ rut: generarRutFicticio(), origen: "formulario" })
      .returning({ id: apoderados.id });
    const [jug] = await db
      .insert(jugadores)
      .values({ rut: generarRutFicticio(), disciplina: "voleibol", origen: "formulario" })
      .returning({ id: jugadores.id });
    const [s] = await db
      .insert(solicitudesRegistro)
      .values({ ...base, token_acceso_hash: hashToken(generarToken()), titular_apoderado_id: apo?.id })
      .returning();
    expect(s?.titular_apoderado_id).toBe(apo?.id);
    await expect(
      db.insert(solicitudesRegistro).values({
        ...base,
        token_acceso_hash: hashToken(generarToken()),
        titular_apoderado_id: apo?.id,
        titular_jugador_id: jug?.id,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(solicitudesRegistro).values({
        ...base,
        token_acceso_hash: hashToken(generarToken()),
        titular_jugador_id: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toThrow();
  });

  it("fichas_previas: una por solicitud y persona, de una solicitud que existe", async () => {
    const [s] = await db
      .insert(solicitudesRegistro)
      .values({ consentimiento_en: new Date(), token_acceso_hash: hashToken(generarToken()) })
      .returning({ id: solicitudesRegistro.id });
    if (!s) throw new Error("sin solicitud");
    const fila = { solicitud_id: s.id, tipo: "jugador" as const, persona_id: s.id, datos: { telefono: null } };
    await db.insert(fichasPrevias).values(fila);
    await expect(db.insert(fichasPrevias).values(fila)).rejects.toThrow();
    await expect(
      db.insert(fichasPrevias).values({ ...fila, solicitud_id: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toThrow();
    await expect(db.execute(sql`insert into fichas_previas (solicitud_id, tipo, persona_id, datos) values (${s.id}, 'otro', ${s.id}, '{}')`)).rejects.toThrow();
    const [leida] = await db.select().from(fichasPrevias).where(eq(fichasPrevias.solicitud_id, s.id));
    expect(leida?.datos).toEqual({ telefono: null });
  });
});
