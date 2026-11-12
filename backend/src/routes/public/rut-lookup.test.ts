import { API, generarRutFicticio } from "@club-colina/shared";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { construirApp } from "../../app";
import { and, eq } from "drizzle-orm";
import { entrenadores, jugadorApoderado, solicitudesRegistro } from "../../db/schema";
import { guardarFoto } from "../../lib/fotos";
import { LIMITES } from "../../lib/limite-intentos";
import { generarToken, hashToken } from "../../lib/tokens";
import { crearApoderado, crearJugador, vaciarRegistro, vincular } from "../../services/registro/datos-prueba";
import { configTest, dbTest, JPEG_PRUEBA } from "../../test/db";

const { db, cerrar } = dbTest();
afterAll(cerrar);
beforeEach(() => vaciarRegistro(db));

async function consultar(app: FastifyInstance, rut: string, ip = "198.51.100.1") {
  return app.inject({ method: "POST", url: API.public.rutLookup, payload: { rut }, headers: { "x-real-ip": ip } });
}

/** El cuerpo no trae ningún valor guardado: ni ids, RUT, teléfonos, correos ni fechas. */
function sinDatos(cuerpo: string, valores: (string | null)[]) {
  for (const v of valores) if (v) expect(cuerpo).not.toContain(v);
  expect(cuerpo).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  expect(cuerpo).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  expect(cuerpo).not.toMatch(/\d{9}/);
}

describe("POST /api/public/rut-lookup", () => {
  it("un RUT mal escrito es 400 sin repetir el valor", async () => {
    const app = await construirApp({ config: configTest(), db });
    const r = await consultar(app, "12.345.678-0");
    expect(r.statusCode).toBe(400);
    expect(r.json().error.codigo).toBe("validacion");
    expect(r.body).not.toContain("12.345.678");
    await app.close();
  });

  it("sin cuerpo o sin rut es 400", async () => {
    const app = await construirApp({ config: configTest(), db });
    for (const payload of [{}, { otro: 1 }]) {
      const r = await app.inject({ method: "POST", url: API.public.rutLookup, payload });
      expect(r.statusCode).toBe(400);
      expect(r.json().error.codigo).toBe("validacion");
    }
    await app.close();
  });

  it("un hijo sin nombre en la base sale con el texto fijo", async () => {
    const apoderado = await crearApoderado(db);
    const hijo = await crearJugador(db, { nombre: null });
    await vincular(db, hijo.id, apoderado.id);
    const app = await construirApp({ config: configTest(), db });
    const r = await consultar(app, apoderado.rut);
    expect(r.json().hijos[0]).toMatchObject({ primer_nombre: "(sin nombre)", faltantes: ["nombre", "numero_camiseta", "foto"] });
    await app.close();
  });

  it("un RUT que no está responde solo encontrado: false", async () => {
    const app = await construirApp({ config: configTest(), db });
    const r = await consultar(app, generarRutFicticio(77));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ encontrado: false });
    expect(r.headers["cache-control"]).toBe("no-store");
    await app.close();
  });

  it("apoderado precargado: qué le falta y sus hijos por posición, sin datos guardados", async () => {
    const apoderado = await crearApoderado(db, { telefono: null, email: "rosa@ejemplo.test" });
    const otro = await crearApoderado(db);
    const t0 = new Date("2026-01-01T00:00:00Z");
    // Se crean en desorden: la lista sale por creado_en del vínculo.
    const segundo = await crearJugador(db, { nombre: "Camila", fecha_nacimiento: null });
    const primero = await crearJugador(db, { nombre: "Tomás Andrés", numero_camiseta: "00" });
    const ajeno = await crearJugador(db, { nombre: "Ajeno" });
    await vincular(db, segundo.id, apoderado.id, { creado_en: new Date(t0.getTime() + 1000), estado: "pendiente" });
    await vincular(db, primero.id, apoderado.id, { creado_en: t0 });
    await vincular(db, ajeno.id, otro.id);

    const app = await construirApp({ config: configTest(), db });
    // Cualquier forma de escribir el RUT.
    const r = await consultar(app, apoderado.rut.replace("-", "").replace(/^(\d{2})(\d{3})/, "$1.$2."));
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      encontrado: true,
      tipo: "apoderado",
      ya_registrado: false,
      faltantes: ["telefono", "foto"],
      hijos: [
        { posicion: 0, primer_nombre: "Tomás", ya_registrado: false, faltantes: ["foto"] },
        {
          posicion: 1,
          primer_nombre: "Camila",
          ya_registrado: false,
          faltantes: ["fecha_nacimiento", "categoria", "numero_camiseta", "foto"],
        },
      ],
    });
    sinDatos(r.body, [apoderado.rut, apoderado.id, primero.rut, primero.id, segundo.id, "rosa@", "Inventado", "Ficticia"]);
    await app.close();
  });

  it("con el mismo creado_en, el orden lo decide jugador_id", async () => {
    const apoderado = await crearApoderado(db);
    const t = new Date("2026-02-01T00:00:00Z");
    const a = await crearJugador(db, { nombre: "Ana" });
    const b = await crearJugador(db, { nombre: "Bruno" });
    await vincular(db, a.id, apoderado.id, { creado_en: t });
    await vincular(db, b.id, apoderado.id, { creado_en: t });
    const esperado = [a, b].sort((x, y) => (x.id < y.id ? -1 : 1)).map((j) => j.nombre);
    const app = await construirApp({ config: configTest(), db });
    const r = await consultar(app, apoderado.rut);
    expect(r.json().hijos.map((h: { primer_nombre: string }) => h.primer_nombre)).toEqual(esperado);
    await app.close();
  });

  it("apoderado que ya envió el formulario: ya_registrado y nada que pedirle", async () => {
    const foto = await guardarFoto(db, JPEG_PRUEBA);
    const apoderado = await crearApoderado(db, { estado: "pendiente", foto_id: foto });
    const hijo = await crearJugador(db, { estado: "pendiente", numero_camiseta: "7", foto_id: foto });
    await vincular(db, hijo.id, apoderado.id);
    const app = await construirApp({ config: configTest(), db });
    const r = await consultar(app, apoderado.rut);
    expect(r.json()).toEqual({
      encontrado: true,
      tipo: "apoderado",
      ya_registrado: true,
      faltantes: [],
      hijos: [{ posicion: 0, primer_nombre: "Tomás", ya_registrado: true, faltantes: [] }],
    });
    await app.close();
  });

  it("un RUT que es apoderado y jugador a la vez se trata como apoderado", async () => {
    const rut = generarRutFicticio(4321);
    await crearApoderado(db, { rut });
    await crearJugador(db, { rut, fecha_nacimiento: "1990-01-01" });
    const app = await construirApp({ config: configTest(), db });
    expect((await consultar(app, rut)).json().tipo).toBe("apoderado");
    await app.close();
  });

  it("jugador adulto precargado: primer nombre, adulto y faltantes con teléfono", async () => {
    const jugador = await crearJugador(db, {
      nombre: "Valentina",
      fecha_nacimiento: "2000-03-03",
      telefono: null,
      disciplina: "voleibol",
    });
    const app = await construirApp({ config: configTest(), db });
    const r = await consultar(app, jugador.rut);
    // Vóley no tiene categoría para el año 2000: hay que preguntarla.
    expect(r.json()).toEqual({
      encontrado: true,
      tipo: "jugador",
      primer_nombre: "Valentina",
      adulto: true,
      ya_registrado: false,
      faltantes: ["categoria", "numero_camiseta", "telefono", "foto"],
    });
    sinDatos(r.body, [jugador.rut, jugador.id]);
    await app.close();
  });

  it("un jugador menor responde igual que un RUT desconocido, sin su nombre", async () => {
    const jugador = await crearJugador(db, { nombre: "Matilde", fecha_nacimiento: "2013-07-01", telefono: null });
    const app = await construirApp({ config: configTest(), db });
    const r = await consultar(app, jugador.rut);
    expect(r.json()).toEqual({ encontrado: false });
    expect(r.body).not.toContain("Matilde");
    await app.close();
  });

  it("oculta el vínculo pendiente hacia un hijo ajeno nombrado por RUT hasta que se aprueba", async () => {
    const apoderado = await crearApoderado(db, { estado: "pendiente" });
    const [s] = await db
      .insert(solicitudesRegistro)
      .values({ token_acceso_hash: hashToken(generarToken()), consentimiento_en: new Date() })
      .returning();
    if (!s) throw new Error("sin solicitud");
    const t0 = new Date("2026-03-01T00:00:00Z");
    const deLaBase = await crearJugador(db, { nombre: "Benjamín" });
    const nuevo = await crearJugador(db, { nombre: "Isidora", estado: "pendiente", origen: "formulario", solicitud_id: s.id });
    const ajeno = await crearJugador(db, { nombre: "Florencia" });
    await vincular(db, deLaBase.id, apoderado.id, { creado_en: t0 });
    await vincular(db, nuevo.id, apoderado.id, { creado_en: new Date(t0.getTime() + 1), estado: "pendiente", solicitud_id: s.id });
    await vincular(db, ajeno.id, apoderado.id, { creado_en: new Date(t0.getTime() + 2), estado: "pendiente", solicitud_id: s.id });

    const app = await construirApp({ config: configTest(), db });
    const nombres = async () =>
      (await consultar(app, apoderado.rut)).json().hijos.map((h: { posicion: number; primer_nombre: string }) => [
        h.posicion,
        h.primer_nombre,
      ]);
    expect(await nombres()).toEqual([
      [0, "Benjamín"],
      [1, "Isidora"],
    ]);
    // Mony aprueba el vínculo: recién ahí aparece.
    await db
      .update(jugadorApoderado)
      .set({ estado: "activo" })
      .where(and(eq(jugadorApoderado.jugador_id, ajeno.id), eq(jugadorApoderado.apoderado_id, apoderado.id)));
    expect(await nombres()).toEqual([
      [0, "Benjamín"],
      [1, "Isidora"],
      [2, "Florencia"],
    ]);
    await app.close();
  });

  it("no mira la tabla de entrenadores", async () => {
    const foto = await guardarFoto(db, JPEG_PRUEBA);
    const rut = generarRutFicticio(999);
    await db.insert(entrenadores).values({
      nombre: "Pedro",
      apellido: "Prueba",
      rut,
      telefono: "922222222",
      disciplina: "basketball",
      foto_id: foto,
      credencial_token: generarToken(),
    });
    const app = await construirApp({ config: configTest(), db });
    expect((await consultar(app, rut)).json()).toEqual({ encontrado: false });
    await app.close();
  });

  it(`después de ${LIMITES.rutLookup.max} consultas desde la misma IP responde 429`, async () => {
    const app = await construirApp({ config: configTest(), db });
    const rut = generarRutFicticio(55);
    for (let i = 0; i < LIMITES.rutLookup.max; i++) {
      expect((await consultar(app, rut)).statusCode).toBe(200);
    }
    const r = await consultar(app, rut);
    expect(r.statusCode).toBe(429);
    expect(r.json().error.codigo).toBe("demasiados_intentos");
    // Otra IP tiene su propio contador.
    expect((await consultar(app, rut, "198.51.100.2")).statusCode).toBe(200);
    await app.close();
  });
});
