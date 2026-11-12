import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { API, FOTO_MAX_BYTES, generarRutFicticio } from "@club-colina/shared";
import { apoderados, categorias, entrenadores, fotos, jugadorApoderado, jugadores, solicitudesRegistro } from "../../db/schema";
import { generarToken, hashToken } from "../../lib/tokens";
import { dbTest, JPEG_PRUEBA, PNG_PRUEBA } from "../../test/db";
import {
  appConSesion,
  crearApoderado,
  crearJugador,
  crearJugadorActivo,
  fotoPrueba,
  multipart,
  vincular,
} from "./prueba.test-utils";

const { db, cerrar } = dbTest();
afterAll(cerrar);

async function categoria(disciplina: "basketball" | "voleibol", nombre: string): Promise<number> {
  const [c] = await db.select().from(categorias).where(eq(categorias.nombre, nombre));
  if (!c || c.disciplina !== disciplina) throw new Error(`sin categoría ${nombre}`);
  return c.id;
}

describe("panel: sin sesión todo niega", () => {
  it("cada ruta nueva responde 401 sin cookie", async () => {
    const { app } = await appConSesion(db);
    const id = await crearJugador(db);
    for (const [method, url] of [
      ["GET", "/api/panel/dashboard"],
      ["GET", "/api/panel/categorias"],
      ["GET", "/api/panel/jugadores"],
      ["GET", `/api/panel/jugadores/${id}`],
      ["PATCH", `/api/panel/jugadores/${id}`],
      ["GET", "/api/panel/apoderados"],
      ["GET", "/api/panel/entrenadores"],
      ["POST", "/api/panel/entrenadores"],
      ["GET", `/api/panel/jugadores/${id}/foto`],
      ["POST", `/api/panel/jugadores/${id}/foto`],
      ["POST", `/api/panel/jugadores/${id}/activar`],
      ["POST", `/api/panel/jugadores/${id}/desactivar`],
      ["POST", `/api/panel/jugadores/${id}/regenerar-token`],
      ["DELETE", API.panel.marcaRetiro(id)],
    ] as const) {
      const r = await app.inject({ method, url, payload: method === "GET" ? undefined : {} });
      expect(r.statusCode, `${method} ${url}`).toBe(401);
    }
    // Y nada cambió.
    const [j] = await db.select().from(jugadores).where(eq(jugadores.id, id));
    expect(j?.estado).toBe("precargado");
    await app.close();
  });
});

describe("dashboard y categorías", () => {
  it("cuenta lo real", async () => {
    const { app, cookies } = await appConSesion(db);
    const antes = (await app.inject({ method: "GET", url: "/api/panel/dashboard", cookies })).json();
    await crearJugadorActivo(db);
    await crearJugador(db);
    await crearApoderado(db);
    const despues = (await app.inject({ method: "GET", url: "/api/panel/dashboard", cookies })).json();
    expect(despues.jugadores_activos).toBe(antes.jugadores_activos + 1);
    expect(despues.precargados_sin_registrar.jugadores).toBe(antes.precargados_sin_registrar.jugadores + 1);
    expect(despues.precargados_sin_registrar.apoderados).toBe(antes.precargados_sin_registrar.apoderados + 1);
    const cats = (await app.inject({ method: "GET", url: "/api/panel/categorias", cookies })).json();
    expect(cats.length).toBeGreaterThanOrEqual(11);
    expect(cats.find((c: { nombre: string }) => c.nombre === "U11 F").se_calcula).toBe(false);
    await app.close();
  });
});

describe("jugadores", () => {
  it("lista con filtros: estado, sin número, faltan datos y búsqueda por RUT con puntos", async () => {
    const { app, cookies } = await appConSesion(db);
    const apellido = `Filtro${Date.now()}`;
    const rut = generarRutFicticio();
    const activo = await crearJugadorActivo(db, {
      apellido,
      numero_camiseta: "99",
      rut,
      categoria_id: await categoria("voleibol", "U14"),
    });
    const precargado = await crearJugador(db, { apellido });
    const listar = async (query: string): Promise<Array<{ id: string }>> =>
      (await app.inject({ method: "GET", url: `/api/panel/jugadores?q=${apellido}&${query}`, cookies })).json();

    expect((await listar("")).map((j) => j.id).sort()).toEqual([activo, precargado].sort());
    expect((await listar("estado=activo")).map((j) => j.id)).toEqual([activo]);
    expect((await listar("sin_numero=true")).map((j) => j.id)).toEqual([activo]);
    expect((await listar("sin_numero=false")).map((j) => j.id)).toEqual([precargado]);
    expect((await listar("faltan_datos=true")).map((j) => j.id)).toEqual([precargado]);
    expect((await listar("faltan_datos=false")).map((j) => j.id)).toEqual([activo]);

    const [cuerpo, dv] = rut.split("-");
    const conPuntos = `${cuerpo?.slice(0, 2)}.${cuerpo?.slice(2, 5)}.${cuerpo?.slice(5)}-${dv}`;
    const porRut = await app.inject({ method: "GET", url: `/api/panel/jugadores?q=${conPuntos}`, cookies });
    expect(porRut.json().map((j: { id: string }) => j.id)).toEqual([activo]);

    const malo = await app.inject({ method: "GET", url: "/api/panel/jugadores?estado=otro", cookies });
    expect(malo.statusCode).toBe(400);
    expect(malo.json().error.codigo).toBe("validacion");
    await app.close();
  });

  it("el buscador trata % y _ como texto", async () => {
    const { app, cookies } = await appConSesion(db);
    const r = await app.inject({ method: "GET", url: "/api/panel/jugadores?q=%25", cookies });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
    await app.close();
  });

  it("detalle con edad, faltantes y apoderados; 404 si no existe o el id no es uuid", async () => {
    const { app, cookies } = await appConSesion(db);
    const id = await crearJugador(db, { fecha_nacimiento: "2000-01-01", telefono: null });
    const apo = await crearApoderado(db, { nombre: "Ana", apellido: "Prueba" });
    let r = await app.inject({ method: "GET", url: `/api/panel/jugadores/${id}`, cookies });
    expect(r.statusCode).toBe(200);
    const sinApoderado = r.json();
    expect(sinApoderado.edad).toBeGreaterThanOrEqual(26);
    // Adulto sin apoderado: le falta su teléfono.
    expect(sinApoderado.faltantes).toEqual(["categoria", "numero_camiseta", "telefono", "foto"]);
    await vincular(db, id, apo, { paga_mensualidad: true });
    // Solo un apoderado activo es contacto: precargado o pendiente, el adulto sigue necesitando
    // su teléfono (decisión de Ignacio, 2026-11-12).
    for (const estado of ["precargado", "pendiente"] as const) {
      await db.update(apoderados).set({ estado }).where(eq(apoderados.id, apo));
      r = await app.inject({ method: "GET", url: `/api/panel/jugadores/${id}`, cookies });
      expect(r.json().faltantes).toEqual(["categoria", "numero_camiseta", "telefono", "foto"]);
    }
    await db
      .update(apoderados)
      .set({ estado: "activo", foto_id: await fotoPrueba(db), credencial_token: generarToken() })
      .where(eq(apoderados.id, apo));
    r = await app.inject({ method: "GET", url: `/api/panel/jugadores/${id}`, cookies });
    expect(r.json().faltantes).toEqual(["categoria", "numero_camiseta", "foto"]);
    expect(r.json().apoderados).toEqual([
      { id: apo, nombre_completo: "Ana Prueba", paga_mensualidad: true, estado_vinculo: "pendiente" },
    ]);
    for (const url of ["/api/panel/jugadores/00000000-0000-4000-8000-000000000000", "/api/panel/jugadores/no-es-uuid"]) {
      expect((await app.inject({ method: "GET", url, cookies })).statusCode).toBe(404);
    }
    await app.close();
  });

  it("PATCH edita, valida la categoría contra la rama y traduce las restricciones", async () => {
    const { app, cookies } = await appConSesion(db);
    const id = await crearJugador(db);
    const u14 = await categoria("voleibol", "U14");
    const u13 = await categoria("basketball", "U13");
    const patch = (payload: object, jugador = id) =>
      app.inject({ method: "PATCH", url: `/api/panel/jugadores/${jugador}`, cookies, payload });

    let r = await patch({ numero_camiseta: "00", categoria_id: u14, beca_mensualidad_pct: 50, telefono: "+56 9 1234 5678" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ numero_camiseta: "00", categoria_id: u14, beca_mensualidad_pct: 50, telefono: "912345678" });

    // Categoría de otra rama, o cambiar de rama sin corregir la categoría: 400.
    expect((await patch({ categoria_id: u13 })).statusCode).toBe(400);
    expect((await patch({ disciplina: "basketball" })).statusCode).toBe(400);
    expect((await patch({ disciplina: "basketball", categoria_id: u13 })).statusCode).toBe(200);
    expect((await patch({ categoria_id: 32000 })).statusCode).toBe(400);
    expect((await patch({ beca_torneos_pct: 101 })).statusCode).toBe(400);

    // RUT repetido: 409.
    const otro = generarRutFicticio();
    await crearJugador(db, { rut: otro });
    r = await patch({ rut: otro });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.codigo).toBe("conflicto");
    expect(r.body).not.toContain(otro);

    // Dejar incompleto a un activo: 422.
    const activo = await crearJugadorActivo(db);
    r = await patch({ fecha_nacimiento: null }, activo);
    expect(r.statusCode).toBe(422);
    expect(r.json().error.codigo).toBe("requisitos_incompletos");

    // Un adulto activo sin apoderado no puede quedar sin teléfono.
    const adulto = await crearJugadorActivo(db, { fecha_nacimiento: "2000-01-01", telefono: "912345678" });
    r = await patch({ telefono: null }, adulto);
    expect(r.statusCode).toBe(422);
    expect(r.json().error.mensaje).toBe("Faltan datos: telefono");
    const [sigue] = await db.select().from(jugadores).where(eq(jugadores.id, adulto));
    expect(sigue?.telefono).toBe("912345678");
    // Si ya le faltaba por otra causa, se puede seguir editando lo demás.
    const sinContacto = await crearJugadorActivo(db, { fecha_nacimiento: "2000-01-01", telefono: null });
    expect((await patch({ beca_torneos_pct: 10 }, sinContacto)).statusCode).toBe(200);

    expect((await patch({ nombre: "X" }, "00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
    await app.close();
  });
});

describe("apoderados", () => {
  it("lista con filtro de faltan datos, detalle con sus jugadores y PATCH", async () => {
    const { app, cookies } = await appConSesion(db);
    const apellido = `Apo${Date.now()}`;
    const completo = await crearApoderado(db, { apellido, foto_id: await fotoPrueba(db) });
    const incompleto = await crearApoderado(db, { apellido, telefono: null });
    const hijo = await crearJugador(db, { nombre: "Tomás", apellido: "Hijo" });
    await vincular(db, hijo, completo, { estado: "activo" });

    const lista = (q: string) =>
      app.inject({ method: "GET", url: `/api/panel/apoderados?q=${apellido}${q}`, cookies });
    expect((await lista("&faltan_datos=true")).json().map((a: { id: string }) => a.id)).toEqual([incompleto]);
    expect((await lista("&faltan_datos=false")).json().map((a: { id: string }) => a.id)).toEqual([completo]);

    const d = (await app.inject({ method: "GET", url: `/api/panel/apoderados/${completo}`, cookies })).json();
    expect(d.faltantes).toEqual([]);
    expect(d.jugadores).toEqual([{ id: hijo, nombre_completo: "Tomás Hijo", paga_mensualidad: false, estado_vinculo: "activo" }]);

    const r = await app.inject({
      method: "PATCH",
      url: `/api/panel/apoderados/${incompleto}`,
      cookies,
      payload: { telefono: "987654321", email: "  Correo@Ejemplo.TEST ", metodo_pago: "forpay_mensual" },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ telefono: "987654321", email: "correo@ejemplo.test", faltantes: ["foto"] });
    await app.close();
  });
});

describe("entrenadores", () => {
  it("se crean con foto, quedan activos con credencial; foto y datos son obligatorios", async () => {
    const { app, cookies } = await appConSesion(db);
    const datos = { nombre: "Carla", apellido: "Entrenadora", rut: generarRutFicticio(), telefono: "911112222", disciplina: "basketball" };
    const crear = (partes: Parameters<typeof multipart>[0]) =>
      app.inject({ method: "POST", url: "/api/panel/entrenadores", cookies, ...multipart(partes) });

    let r = await crear([{ nombre: "datos", valor: JSON.stringify(datos) }, { nombre: "foto", archivo: JPEG_PRUEBA }]);
    expect(r.statusCode).toBe(201);
    const e = r.json();
    expect(e).toMatchObject({ nombre: "Carla", estado: "activo", tiene_foto: true });
    expect(e.credencial_token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Mismo RUT: 409, y no queda una foto huérfana.
    const fotosAntes = (await db.select({ id: fotos.id }).from(fotos)).length;
    r = await crear([{ nombre: "datos", valor: JSON.stringify(datos) }, { nombre: "foto", archivo: JPEG_PRUEBA }]);
    expect(r.statusCode).toBe(409);
    expect((await db.select({ id: fotos.id }).from(fotos)).length).toBe(fotosAntes);

    const otro = { ...datos, rut: generarRutFicticio() };
    r = await crear([{ nombre: "datos", valor: JSON.stringify(otro) }]);
    expect(r.statusCode).toBe(400);
    expect(r.json().error.codigo).toBe("archivo_invalido");
    r = await crear([{ nombre: "datos", valor: JSON.stringify(otro) }, { nombre: "foto", archivo: Buffer.from("no es imagen") }]);
    expect(r.json().error.codigo).toBe("archivo_invalido");
    r = await crear([{ nombre: "datos", valor: "{no json" }, { nombre: "foto", archivo: JPEG_PRUEBA }]);
    expect(r.json().error.codigo).toBe("validacion");
    r = await crear([
      { nombre: "datos", valor: JSON.stringify(otro) },
      { nombre: "foto", archivo: Buffer.alloc(FOTO_MAX_BYTES + 10, 0xff) },
    ]);
    expect(r.statusCode).toBe(413);
    expect(r.json().error.codigo).toBe("archivo_invalido");
    r = await app.inject({ method: "POST", url: "/api/panel/entrenadores", cookies, payload: otro });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.codigo).toBe("archivo_invalido");
    expect(await db.select().from(entrenadores).where(eq(entrenadores.rut, otro.rut))).toHaveLength(0);

    r = await app.inject({ method: "PATCH", url: `/api/panel/entrenadores/${e.id}`, cookies, payload: { telefono: "933334444" } });
    expect(r.json().telefono).toBe("933334444");
    const lista = (await app.inject({ method: "GET", url: "/api/panel/entrenadores", cookies })).json();
    expect(lista.some((x: { id: string }) => x.id === e.id)).toBe(true);
    await app.close();
  });
});

describe("fotos y credenciales", () => {
  it("la foto se sirve sin caché y se puede cambiar; la anterior se borra", async () => {
    const { app, cookies } = await appConSesion(db);
    const id = await crearApoderado(db);
    const url = `/api/panel/apoderados/${id}/foto`;
    expect((await app.inject({ method: "GET", url, cookies })).statusCode).toBe(404);

    let r = await app.inject({ method: "POST", url, cookies, ...multipart([{ nombre: "foto", archivo: JPEG_PRUEBA }]) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ tiene_foto: true });
    const [a1] = await db.select({ foto_id: apoderados.foto_id }).from(apoderados).where(eq(apoderados.id, id));

    r = await app.inject({ method: "POST", url, cookies, ...multipart([{ nombre: "foto", archivo: PNG_PRUEBA }]) });
    expect(r.statusCode).toBe(200);
    expect(await db.select().from(fotos).where(eq(fotos.id, a1?.foto_id ?? ""))).toHaveLength(0);

    r = await app.inject({ method: "GET", url, cookies });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("image/png");
    expect(r.headers["cache-control"]).toBe("private, no-store");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");

    r = await app.inject({ method: "POST", url, cookies, ...multipart([{ nombre: "otro", archivo: PNG_PRUEBA }]) });
    expect(r.json().error.codigo).toBe("archivo_invalido");
    r = await app.inject({ method: "POST", url, cookies, ...multipart([{ nombre: "foto", archivo: Buffer.alloc(FOTO_MAX_BYTES + 1, 0xff) }]) });
    expect(r.statusCode).toBe(413);
    expect((await app.inject({ method: "GET", url: `/api/panel/otros/${id}/foto`, cookies })).statusCode).toBe(404);
    await app.close();
  });

  it("activar exige lo mismo que aprobar y genera credencial; desactivar la anula", async () => {
    const { app, cookies } = await appConSesion(db);
    const id = await crearJugador(db);
    const accion = (a: string, j = id, tipo = "jugadores") =>
      app.inject({ method: "POST", url: `/api/panel/${tipo}/${j}/${a}`, cookies });

    let r = await accion("activar");
    expect(r.statusCode).toBe(422);
    expect(r.json().error.mensaje).toContain("numero_camiseta");
    expect(r.json().error.mensaje).toContain("foto");
    // Regenerar solo con credencial activa.
    expect((await accion("regenerar-token")).statusCode).toBe(409);

    // Mony completa la ficha en el panel: número y foto. La categoría no es requisito.
    await app.inject({ method: "PATCH", url: `/api/panel/jugadores/${id}`, cookies, payload: { numero_camiseta: "99", categoria_id: null } });
    await app.inject({ method: "POST", url: `/api/panel/jugadores/${id}/foto`, cookies, ...multipart([{ nombre: "foto", archivo: JPEG_PRUEBA }]) });
    r = await accion("activar");
    expect(r.statusCode).toBe(200);
    const token1 = r.json().credencial_token;
    expect(r.json().estado).toBe("activo");
    expect(token1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await accion("activar")).statusCode).toBe(409);

    r = await accion("regenerar-token");
    expect(r.statusCode).toBe(200);
    const token2 = r.json().credencial_token;
    expect(token2).not.toBe(token1);

    r = await accion("desactivar");
    expect(r.json()).toEqual({ estado: "inactivo", credencial_token: null });
    const [j] = await db.select().from(jugadores).where(eq(jugadores.id, id));
    expect(j?.credencial_token).toBeNull();
    // Idempotente.
    expect((await accion("desactivar")).statusCode).toBe(200);

    // Reactivar da un token nuevo, distinto de los anteriores.
    r = await accion("activar");
    expect(r.statusCode).toBe(200);
    expect([token1, token2]).not.toContain(r.json().credencial_token);

    // Un pendiente se maneja desde su solicitud.
    const pendiente = await crearJugador(db, { estado: "pendiente" });
    expect((await accion("activar", pendiente)).statusCode).toBe(409);
    expect((await accion("desactivar", pendiente)).statusCode).toBe(409);
    expect((await accion("activar", "00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
    await app.close();
  });

  it("activar a un precargado activa sus vínculos de la base cuyo otro extremo ya está activo", async () => {
    const { app, cookies } = await appConSesion(db);
    const listo = async () => ({ foto_id: await fotoPrueba(db) });
    const j = await crearJugador(db, { numero_camiseta: "5", ...(await listo()) });
    const apoActivo = await crearApoderado(db, { estado: "activo", credencial_token: generarToken(), ...(await listo()) });
    const apoPrecargado = await crearApoderado(db, await listo());
    const apoDeSolicitud = await crearApoderado(db, { estado: "activo", credencial_token: generarToken(), ...(await listo()) });
    const s = await db
      .insert(solicitudesRegistro)
      .values({ token_acceso_hash: hashToken(generarToken()), consentimiento_en: new Date() })
      .returning({ id: solicitudesRegistro.id });
    await vincular(db, j, apoActivo, { estado: "pendiente" });
    await vincular(db, j, apoPrecargado, { estado: "pendiente" });
    await db.insert(jugadorApoderado).values({ jugador_id: j, apoderado_id: apoDeSolicitud, solicitud_id: s[0]?.id });
    const estadoVinculo = async (a: string) =>
      (
        await db
          .select({ estado: jugadorApoderado.estado })
          .from(jugadorApoderado)
          .where(and(eq(jugadorApoderado.jugador_id, j), eq(jugadorApoderado.apoderado_id, a)))
      )[0]?.estado;

    expect((await app.inject({ method: "POST", url: API.panel.activar("jugadores", j), cookies })).statusCode).toBe(200);
    expect(await estadoVinculo(apoActivo)).toBe("activo");
    // El otro extremo no está activo: espera.
    expect(await estadoVinculo(apoPrecargado)).toBe("pendiente");
    // Un vínculo que creó una solicitud se decide desde esa solicitud.
    expect(await estadoVinculo(apoDeSolicitud)).toBe("pendiente");

    // Al activar al apoderado precargado, su vínculo con el jugador (ya activo) se activa.
    expect((await app.inject({ method: "POST", url: API.panel.activar("apoderados", apoPrecargado), cookies })).statusCode).toBe(200);
    expect(await estadoVinculo(apoPrecargado)).toBe("activo");

    // Reactivar a un inactivo no toca vínculos: solo el paso de precargado a activo.
    const inactivo = await crearJugador(db, { numero_camiseta: "6", estado: "inactivo", ...(await listo()) });
    await vincular(db, inactivo, apoActivo, { estado: "pendiente" });
    expect((await app.inject({ method: "POST", url: API.panel.activar("jugadores", inactivo), cookies })).statusCode).toBe(200);
    const [v] = await db
      .select({ estado: jugadorApoderado.estado })
      .from(jugadorApoderado)
      .where(and(eq(jugadorApoderado.jugador_id, inactivo), eq(jugadorApoderado.apoderado_id, apoActivo)));
    expect(v?.estado).toBe("pendiente");
    await app.close();
  });

  it("apoderados y entrenadores: activar, desactivar y reactivar", async () => {
    const { app, cookies } = await appConSesion(db);
    const apo = await crearApoderado(db, { telefono: null });
    const accion = (tipo: string, id: string, a: string) =>
      app.inject({ method: "POST", url: `/api/panel/${tipo}/${id}/${a}`, cookies });
    let r = await accion("apoderados", apo, "activar");
    expect(r.statusCode).toBe(422);
    expect(r.json().error.mensaje).toBe("Faltan datos: telefono, foto");
    await db.update(apoderados).set({ telefono: "912345678", foto_id: await fotoPrueba(db) }).where(eq(apoderados.id, apo));
    expect((await accion("apoderados", apo, "activar")).json().estado).toBe("activo");

    const [ent] = await db
      .insert(entrenadores)
      .values({
        nombre: "E",
        apellido: "F",
        rut: generarRutFicticio(),
        telefono: "912345678",
        disciplina: "voleibol",
        foto_id: await fotoPrueba(db),
        credencial_token: "a".repeat(43),
      })
      .returning({ id: entrenadores.id });
    if (!ent) throw new Error("sin entrenador");
    expect((await accion("entrenadores", ent.id, "activar")).statusCode).toBe(409);
    expect((await accion("entrenadores", ent.id, "desactivar")).json()).toEqual({ estado: "inactivo", credencial_token: null });
    expect((await accion("entrenadores", ent.id, "regenerar-token")).statusCode).toBe(409);
    r = await accion("entrenadores", ent.id, "activar");
    expect(r.json().estado).toBe("activo");
    expect(r.json().credencial_token).not.toBe("a".repeat(43));
    await app.close();
  });
});

describe("casos que pidió la revisión", () => {
  it("un categoria_id fuera de smallint es 400 o lista vacía, nunca 500", async () => {
    const { app, cookies } = await appConSesion(db);
    const id = await crearJugador(db);
    let r = await app.inject({ method: "GET", url: "/api/panel/jugadores?categoria_id=40000", cookies });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual([]);
    r = await app.inject({ method: "PATCH", url: `/api/panel/jugadores/${id}`, cookies, payload: { categoria_id: 40000 } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.codigo).toBe("validacion");
    await app.close();
  });

  it("filtros por rama y categoría de jugadores, y por estado de apoderados", async () => {
    const { app, cookies } = await appConSesion(db);
    const apellido = `Rama${Date.now()}`;
    const u14 = await categoria("voleibol", "U14");
    const voley = await crearJugador(db, { apellido, categoria_id: u14 });
    const basket = await crearJugador(db, { apellido, disciplina: "basketball", fecha_nacimiento: "2015-02-02" });
    const ids = async (q: string) =>
      (await app.inject({ method: "GET", url: `/api/panel/jugadores?q=${apellido}&${q}`, cookies })).json().map((j: { id: string }) => j.id);
    expect(await ids("disciplina=voleibol")).toEqual([voley]);
    expect(await ids("disciplina=basketball")).toEqual([basket]);
    expect(await ids(`categoria_id=${u14}`)).toEqual([voley]);

    const activo = await crearApoderado(db, { apellido, estado: "activo", foto_id: await fotoPrueba(db), credencial_token: generarToken() });
    const precargado = await crearApoderado(db, { apellido });
    const apos = async (q: string) =>
      (await app.inject({ method: "GET", url: `/api/panel/apoderados?q=${apellido}&${q}`, cookies })).json().map((a: { id: string }) => a.id);
    expect(await apos("estado=activo")).toEqual([activo]);
    expect(await apos("estado=precargado")).toEqual([precargado]);
    await app.close();
  });

  it("el buscador trata _ como texto", async () => {
    const { app, cookies } = await appConSesion(db);
    const apellido = `Guion${Date.now()}`;
    await crearJugador(db, { apellido: `${apellido}x` });
    const r = await app.inject({ method: "GET", url: `/api/panel/jugadores?q=${apellido}_`, cookies });
    expect(r.json()).toEqual([]);
    await app.close();
  });

  it("dashboard: solicitudes pendientes y entrenadores activos", async () => {
    const { app, cookies } = await appConSesion(db);
    const antes = (await app.inject({ method: "GET", url: "/api/panel/dashboard", cookies })).json();
    await db.insert(solicitudesRegistro).values({ token_acceso_hash: hashToken(generarToken()), consentimiento_en: new Date() });
    await db.insert(entrenadores).values({
      nombre: "E", apellido: "F", rut: generarRutFicticio(), telefono: "912345678", disciplina: "voleibol",
      foto_id: await fotoPrueba(db), credencial_token: generarToken(),
    });
    const despues = (await app.inject({ method: "GET", url: "/api/panel/dashboard", cookies })).json();
    expect(despues.solicitudes_pendientes).toBe(antes.solicitudes_pendientes + 1);
    expect(despues.entrenadores_activos).toBe(antes.entrenadores_activos + 1);
    await app.close();
  });

  it("apoderados: 409 por RUT repetido y 422 si un activo queda incompleto; un rechazado no se activa", async () => {
    const { app, cookies } = await appConSesion(db);
    const rut = generarRutFicticio();
    await crearApoderado(db, { rut });
    const activo = await crearApoderado(db, { estado: "activo", foto_id: await fotoPrueba(db), credencial_token: generarToken() });
    const patch = (payload: object) => app.inject({ method: "PATCH", url: `/api/panel/apoderados/${activo}`, cookies, payload });
    expect((await patch({ rut })).statusCode).toBe(409);
    expect((await patch({ telefono: null })).statusCode).toBe(422);
    const rechazado = await crearApoderado(db, { estado: "rechazado", foto_id: await fotoPrueba(db) });
    expect((await app.inject({ method: "POST", url: `/api/panel/apoderados/${rechazado}/activar`, cookies })).statusCode).toBe(409);
    await app.close();
  });

  it("un adulto con su único apoderado inactivo necesita su propio teléfono", async () => {
    const { app, cookies } = await appConSesion(db);
    const adulto = await crearJugador(db, { fecha_nacimiento: "2000-01-01", telefono: null, numero_camiseta: "9", foto_id: await fotoPrueba(db) });
    const apo = await crearApoderado(db, { estado: "inactivo" });
    await vincular(db, adulto, apo, { estado: "activo" });
    const r = await app.inject({ method: "POST", url: `/api/panel/jugadores/${adulto}/activar`, cookies });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.mensaje).toContain("telefono");
    await app.close();
  });

  it("entrenadores: detalle, 404, 409 por RUT repetido, foto y regenerar token", async () => {
    const { app, cookies } = await appConSesion(db);
    const rut = generarRutFicticio();
    const crear = async (r: string) => {
      const [e] = await db.insert(entrenadores).values({
        nombre: "E", apellido: "F", rut: r, telefono: "912345678", disciplina: "voleibol",
        foto_id: await fotoPrueba(db), credencial_token: generarToken(),
      }).returning({ id: entrenadores.id });
      if (!e) throw new Error("sin entrenador");
      return e.id;
    };
    const uno = await crear(rut);
    const dos = await crear(generarRutFicticio());
    expect((await app.inject({ method: "GET", url: `/api/panel/entrenadores/${uno}`, cookies })).json().rut).toBe(rut);
    expect((await app.inject({ method: "GET", url: "/api/panel/entrenadores/00000000-0000-4000-8000-000000000000", cookies })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: `/api/panel/entrenadores/${dos}`, cookies, payload: { rut } })).statusCode).toBe(409);
    const foto = await app.inject({ method: "POST", url: `/api/panel/entrenadores/${uno}/foto`, cookies, ...multipart([{ nombre: "foto", archivo: PNG_PRUEBA }]) });
    expect(foto.statusCode).toBe(200);
    const leida = await app.inject({ method: "GET", url: `/api/panel/entrenadores/${uno}/foto`, cookies });
    expect(leida.headers["content-type"]).toBe("image/png");
    const r = await app.inject({ method: "POST", url: `/api/panel/entrenadores/${uno}/regenerar-token`, cookies });
    expect(r.json().credencial_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await app.close();
  });

  it("regenerar token de un apoderado activo, y un multipart con dos fotos es 400", async () => {
    const { app, cookies } = await appConSesion(db);
    const viejo = generarToken();
    const apo = await crearApoderado(db, { estado: "activo", foto_id: await fotoPrueba(db), credencial_token: viejo });
    const r = await app.inject({ method: "POST", url: `/api/panel/apoderados/${apo}/regenerar-token`, cookies });
    expect(r.statusCode).toBe(200);
    expect(r.json().credencial_token).not.toBe(viejo);
    const dos = await app.inject({
      method: "POST",
      url: `/api/panel/apoderados/${apo}/foto`,
      cookies,
      ...multipart([{ nombre: "foto", archivo: JPEG_PRUEBA }, { nombre: "foto", archivo: PNG_PRUEBA }]),
    });
    expect(dos.statusCode).toBe(400);
    expect(dos.json().error.codigo).toBe("archivo_invalido");
    await app.close();
  });

  it("las rutas de detalle y edición también niegan sin sesión", async () => {
    const { app } = await appConSesion(db);
    const apo = await crearApoderado(db);
    for (const [method, url] of [
      ["GET", `/api/panel/apoderados/${apo}`],
      ["PATCH", `/api/panel/apoderados/${apo}`],
      ["GET", "/api/panel/entrenadores/00000000-0000-4000-8000-000000000000"],
      ["PATCH", "/api/panel/entrenadores/00000000-0000-4000-8000-000000000000"],
    ] as const) {
      expect((await app.inject({ method, url, payload: method === "GET" ? undefined : {} })).statusCode).toBe(401);
    }
    await app.close();
  });

  it("activar deja en el log quién lo hizo, sin el token", async () => {
    const { PassThrough } = await import("node:stream");
    const lineas: string[] = [];
    const salida = new PassThrough();
    salida.on("data", (c: Buffer) => lineas.push(c.toString()));
    const { cookies } = await appConSesion(db);
    const { construirApp } = await import("../../app");
    const { configTest } = await import("../../test/db");
    const app = await construirApp({ config: configTest({ LOG_LEVEL: "info" }), db, logStream: salida });
    const apo = await crearApoderado(db, { foto_id: await fotoPrueba(db) });
    const r = await app.inject({ method: "POST", url: `/api/panel/apoderados/${apo}/activar`, cookies });
    expect(r.statusCode).toBe(200);
    await app.close();
    const log = lineas.join("");
    expect(log).toContain('"accion":"activar"');
    expect(log).toContain(`"persona_id":"${apo}"`);
    expect(log).toContain('"usuario_id":"');
    expect(log).not.toContain(r.json().credencial_token);
  });
});
