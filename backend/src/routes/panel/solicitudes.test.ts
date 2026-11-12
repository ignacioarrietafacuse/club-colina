import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { API } from "@club-colina/shared";
import {
  apoderados,
  categorias,
  fichasPrevias,
  fotos,
  jugadorApoderado,
  jugadores,
  solicitudesRegistro,
} from "../../db/schema";
import { CANDADO_SOLICITUDES } from "../../lib/candados";
import { generarToken, hashToken } from "../../lib/tokens";
import { dbTest, JPEG_PRUEBA } from "../../test/db";
import { appConSesion, crearApoderado, crearJugador, crearJugadorActivo, fotoPrueba, multipart } from "./prueba.test-utils";

const { db, cerrar } = dbTest();
afterAll(cerrar);

const becas = { beca_mensualidad_pct: 25, beca_torneos_pct: 0, beca_campus_pct: 100 };

async function nuevaSolicitud(extra: Partial<typeof solicitudesRegistro.$inferInsert> = {}) {
  const [s] = await db
    .insert(solicitudesRegistro)
    .values({ token_acceso_hash: hashToken(generarToken()), consentimiento_en: new Date(), ...extra })
    .returning();
  if (!s) throw new Error("sin solicitud");
  return s;
}

/**
 * Una foto como la guarda S2: en la misma transacción que la solicitud, así que con su mismo
 * `creado_en`. Una foto más nueva es una que Mony subió después desde el panel.
 */
async function fotoDeLaSolicitud(s: { creada_en: Date }): Promise<string> {
  const id = await fotoPrueba(db);
  await db.update(fotos).set({ creado_en: s.creada_en }).where(eq(fotos.id, id));
  return id;
}

/**
 * Una familia como la deja S2: apoderado nuevo (titular) con su hijo nuevo, los dos con
 * `solicitud_id`, y el vínculo entre ellos, todo con el mismo `creado_en` (una transacción).
 */
async function familia(extra: Partial<typeof solicitudesRegistro.$inferInsert> = {}) {
  const s = await nuevaSolicitud({ avisos: ["hijo_con_otro_apoderado"], coincide_base: true, ...extra });
  const apellido = `Fam${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const apo = await crearApoderado(db, {
    nombre: "Marta",
    apellido,
    estado: "pendiente",
    origen: "formulario",
    solicitud_id: s.id,
    foto_id: await fotoPrueba(db),
  });
  const hijo = await crearJugador(db, {
    nombre: "Luis",
    apellido,
    estado: "pendiente",
    origen: "formulario",
    solicitud_id: s.id,
    foto_id: await fotoPrueba(db),
  });
  await db.update(solicitudesRegistro).set({ titular_apoderado_id: apo }).where(eq(solicitudesRegistro.id, s.id));
  await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: apo, solicitud_id: s.id, paga_mensualidad: true });
  return { s, apo, hijo, apellido };
}

async function u14(): Promise<number> {
  const [c] = await db
    .select()
    .from(categorias)
    .where(and(eq(categorias.nombre, "U14"), eq(categorias.disciplina, "voleibol")));
  if (!c) throw new Error("sin U14");
  return c.id;
}

async function estadoJ(id: string) {
  const [j] = await db.select().from(jugadores).where(eq(jugadores.id, id));
  return j;
}
async function estadoA(id: string) {
  const [a] = await db.select().from(apoderados).where(eq(apoderados.id, id));
  return a;
}
async function estadoS(id: string) {
  const [s] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, id));
  return s?.estado;
}
async function vinculo(j: string, a: string) {
  const [v] = await db
    .select()
    .from(jugadorApoderado)
    .where(and(eq(jugadorApoderado.jugador_id, j), eq(jugadorApoderado.apoderado_id, a)));
  return v;
}

describe("solicitudes: lectura", () => {
  it("sin sesión, 401 y nada cambia", async () => {
    const { app } = await appConSesion(db);
    const { s } = await familia();
    for (const [method, url] of [
      ["GET", "/api/panel/solicitudes"],
      ["GET", `/api/panel/solicitudes/${s.id}`],
      ["POST", `/api/panel/solicitudes/${s.id}/aprobar`],
      ["POST", `/api/panel/solicitudes/${s.id}/rechazar`],
      ["POST", `/api/panel/solicitudes/${s.id}/link`],
      ["POST", `/api/panel/solicitudes/${s.id}/dar-por-revisada`],
    ] as const) {
      expect((await app.inject({ method, url, payload: method === "POST" ? {} : undefined })).statusCode).toBe(401);
    }
    const [fila] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, s.id));
    expect(fila?.token_acceso_hash).toBe(s.token_acceso_hash);
    expect(fila?.estado).toBe("pendiente");
    await app.close();
  });

  it("listado con titular, avisos y pendientes; detalle con personas y vínculos; 404 y 400", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo, apellido } = await familia();
    const lista = (await app.inject({ method: "GET", url: "/api/panel/solicitudes?estado=pendiente", cookies })).json();
    expect(lista.find((x: { id: string }) => x.id === s.id)).toMatchObject({
      tipo: "formulario",
      coincide_base: true,
      avisos: ["hijo_con_otro_apoderado"],
      titular: { nombre_completo: `Marta ${apellido}`, rol: "apoderado" },
      personas_pendientes: 2,
    });
    const d = (await app.inject({ method: "GET", url: `/api/panel/solicitudes/${s.id}`, cookies })).json();
    expect(d.jugadores.map((j: { id: string }) => j.id)).toEqual([hijo]);
    expect(d.apoderados.map((a: { id: string }) => a.id)).toEqual([apo]);
    expect(d.vinculos).toEqual([{ jugador_id: hijo, apoderado_id: apo, paga_mensualidad: true, estado: "pendiente" }]);
    expect(JSON.stringify(d)).not.toContain(s.token_acceso_hash);
    expect(
      (await app.inject({ method: "GET", url: "/api/panel/solicitudes/00000000-0000-4000-8000-000000000000", cookies })).statusCode,
    ).toBe(404);
    const malo = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/aprobar`, cookies, payload: { jugadores: "x" } });
    expect(malo.statusCode).toBe(400);
    expect(malo.json().error.codigo).toBe("validacion");
    await app.close();
  });

  it("titular desde la columna: apoderado ya registrado que vuelve sin vínculos nuevos, jugador adulto, sin datos", async () => {
    const { app, cookies } = await appConSesion(db);
    const viejo = await crearApoderado(db, { nombre: "Ya", apellido: "Registrado" });
    const marcado = await crearJugador(db, { nombre: "Ida", marcado_retiro_en: new Date() });
    await db.insert(jugadorApoderado).values({ jugador_id: marcado, apoderado_id: viejo, estado: "activo" });
    const vuelve = await nuevaSolicitud({ titular_apoderado_id: viejo, avisos: ["hijo_marcado_ya_no_esta"] });
    const adulto = await crearJugador(db, { nombre: "Ana", apellido: "Adulta", estado: "pendiente", solicitud_id: null });
    const deAdulto = await nuevaSolicitud({ titular_jugador_id: adulto });
    const sinTitular = await nuevaSolicitud();

    const lista = (await app.inject({ method: "GET", url: "/api/panel/solicitudes", cookies })).json();
    const de = (id: string) => lista.find((x: { id: string }) => x.id === id).titular;
    expect(de(vuelve.id)).toEqual({ nombre_completo: "Ya Registrado", rol: "apoderado" });
    expect(de(deAdulto.id)).toEqual({ nombre_completo: "Ana Adulta", rol: "jugador" });
    expect(de(sinTitular.id)).toEqual({ nombre_completo: "(sin datos)", rol: "apoderado" });

    // El detalle muestra al titular y al hijo marcado, aunque no tengan esa solicitud_id.
    const d = (await app.inject({ method: "GET", url: `/api/panel/solicitudes/${vuelve.id}`, cookies })).json();
    expect(d.apoderados.map((a: { id: string }) => a.id)).toEqual([viejo]);
    const ficha = d.jugadores.find((j: { id: string }) => j.id === marcado);
    expect(ficha.marcado_retiro_en).not.toBeNull();
    await app.close();
  });
});

describe("solicitudes: aprobar", () => {
  it("parcial y después total: credenciales, becas, vínculo solo si viene listado; la solicitud pasa a revisada", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    const aprobar = (payload: object) =>
      app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/aprobar`, cookies, payload });

    let r = await aprobar({
      jugadores: [{ id: hijo, categoria_id: await u14(), numero_camiseta: "00", ...becas }],
      apoderados: [{ id: apo, metodo_pago: "forpay_mensual" }],
    });
    expect(r.statusCode).toBe(200);
    // Aprobar a las dos personas no aprueba el vínculo: no venía en el pedido.
    expect((await vinculo(hijo, apo))?.estado).toBe("pendiente");
    expect(r.json().estado).toBe("pendiente");
    expect(await estadoJ(hijo)).toMatchObject({ estado: "activo", numero_camiseta: "00", beca_campus_pct: 100 });
    expect((await estadoJ(hijo))?.credencial_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await estadoA(apo)).toMatchObject({ estado: "activo", metodo_pago: "forpay_mensual" });

    r = await aprobar({ vinculos: [{ jugador_id: hijo, apoderado_id: apo }] });
    expect(r.json().estado).toBe("revisada");
    expect(r.json().revisada_en).not.toBeNull();
    expect((await aprobar({ apoderados: [{ id: apo }] })).statusCode).toBe(409);
    await app.close();
  });

  it("si falta algo no se aprueba nada (422)", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    await db.update(jugadores).set({ foto_id: null }).where(eq(jugadores.id, hijo));
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: { apoderados: [{ id: apo }], jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "99", ...becas }] },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toEqual({ codigo: "requisitos_incompletos", mensaje: "Faltan datos: foto" });
    expect(await estadoA(apo)).toMatchObject({ estado: "pendiente", credencial_token: null });
    await app.close();
  });

  it("la marca 'ya no está' es solo una señal: no impide aprobar ni activar, y se conserva", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, hijo } = await familia();
    const marca = new Date("2026-11-01T12:00:00Z");
    await db.update(jugadores).set({ marcado_retiro_en: marca }).where(eq(jugadores.id, hijo));
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: { jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "7", ...becas }] },
    });
    expect(r.statusCode).toBe(200);
    expect(await estadoJ(hijo)).toMatchObject({ estado: "activo", marcado_retiro_en: marca });

    // Un precargado marcado, con un apoderado activo de la base: se activa y la marca sigue.
    const precargado = await crearJugador(db, { numero_camiseta: "3", foto_id: await fotoPrueba(db), marcado_retiro_en: marca });
    const apoBase = await crearApoderado(db, { estado: "activo", foto_id: await fotoPrueba(db), credencial_token: generarToken() });
    await db.insert(jugadorApoderado).values({ jugador_id: precargado, apoderado_id: apoBase, estado: "activo" });
    const activar = () => app.inject({ method: "POST", url: `/api/panel/jugadores/${precargado}/activar`, cookies });
    expect((await activar()).statusCode).toBe(200);
    expect(await estadoJ(precargado)).toMatchObject({ estado: "activo", marcado_retiro_en: marca });
    // Mony lo da de baja (se fue) y después lo reactiva (volvió): reactivar le quita la marca.
    expect((await app.inject({ method: "POST", url: `/api/panel/jugadores/${precargado}/desactivar`, cookies })).statusCode).toBe(200);
    expect(await estadoJ(precargado)).toMatchObject({ estado: "inactivo", marcado_retiro_en: marca });
    expect((await activar()).statusCode).toBe(200);
    expect(await estadoJ(precargado)).toMatchObject({ estado: "activo", marcado_retiro_en: null });

    // Mony confirma con la familia que sigue: quita la marca.
    const q = await app.inject({ method: "DELETE", url: API.panel.marcaRetiro(hijo), cookies });
    expect(q.statusCode).toBe(200);
    expect(q.json().marcado_retiro_en).toBeNull();
    await app.close();
  });

  it("vínculos: se aprueban solo con el jugador y el apoderado activos, con mensajes claros", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    const inactivo = await crearJugador(db, { estado: "inactivo" });
    const rechazado = await crearJugador(db, { estado: "rechazado" });
    await db.insert(jugadorApoderado).values([
      { jugador_id: inactivo, apoderado_id: apo, solicitud_id: s.id },
      { jugador_id: rechazado, apoderado_id: apo, solicitud_id: s.id },
    ]);
    const aprobar = (payload: object) =>
      app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/aprobar`, cookies, payload });

    // El apoderado sigue pendiente: el vínculo no se aprueba.
    let r = await aprobar({
      jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "1", ...becas }],
      vinculos: [{ jugador_id: hijo, apoderado_id: apo }],
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.mensaje).toBe("El apoderado de ese vínculo no está activo: hay que aprobarlo antes que el vínculo");
    expect((await estadoJ(hijo))?.estado).toBe("pendiente"); // nada quedó a medias

    await aprobar({ apoderados: [{ id: apo }] });
    r = await aprobar({ vinculos: [{ jugador_id: inactivo, apoderado_id: apo }] });
    expect(r.json().error).toEqual({
      codigo: "conflicto",
      mensaje: "El jugador de ese vínculo está inactivo: reactívalo en su ficha antes de aprobar el vínculo",
    });
    r = await aprobar({ vinculos: [{ jugador_id: rechazado, apoderado_id: apo }] });
    expect(r.json().error.mensaje).toBe("El jugador de ese vínculo no está activo: hay que aprobarlo antes que el vínculo");

    // Persona y vínculo en el mismo pedido: vale, porque los vínculos van al final.
    r = await aprobar({
      jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "1", ...becas }],
      vinculos: [{ jugador_id: hijo, apoderado_id: apo }],
    });
    expect(r.statusCode).toBe(200);
    expect((await vinculo(hijo, apo))?.estado).toBe("activo");
    await app.close();
  });
});

describe("solicitudes: solo desde la propia", () => {
  it("un hijo pendiente de otra solicitud, nombrado por RUT, no se aprueba ni se rechaza desde la ajena", async () => {
    const { app, cookies } = await appConSesion(db);
    const real = await familia();
    // El suplantador nombra al hijo de la familia real: S2 solo crea el vínculo, con su solicitud.
    const falsa = await familia();
    await db.insert(jugadorApoderado).values({ jugador_id: real.hijo, apoderado_id: falsa.apo, solicitud_id: falsa.s.id });

    const d = (await app.inject({ method: "GET", url: `/api/panel/solicitudes/${falsa.s.id}`, cookies })).json();
    const visto = d.jugadores.find((j: { id: string }) => j.id === real.hijo);
    expect(visto).toMatchObject({ estado: "pendiente", nombre: "Luis" });

    const desdeFalsa = (accion: string, payload: object) =>
      app.inject({ method: "POST", url: `/api/panel/solicitudes/${falsa.s.id}/${accion}`, cookies, payload });
    expect(
      (await desdeFalsa("aprobar", { jugadores: [{ id: real.hijo, categoria_id: null, numero_camiseta: "5", ...becas }] })).statusCode,
    ).toBe(409);
    expect((await desdeFalsa("rechazar", { personas: [{ rol: "jugador", id: real.hijo }] })).statusCode).toBe(409);

    // Rechazar la falsa entera no toca al hijo real ni a su solicitud: solo borra el vínculo.
    const r = await desdeFalsa("rechazar", {});
    expect(r.statusCode).toBe(200);
    expect((await estadoJ(real.hijo))?.estado).toBe("pendiente");
    expect(await estadoS(real.s.id)).toBe("pendiente");
    expect(await vinculo(real.hijo, falsa.apo)).toBeUndefined();
    expect(await vinculo(real.hijo, real.apo)).toBeDefined();
    expect(await estadoS(falsa.s.id)).toBe("revisada");
    await app.close();
  });

  it("rechazar a un apoderado borra también el vínculo que ya se había aprobado", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo } = await familia();
    const ajeno = await crearJugadorActivo(db);
    await db.insert(jugadorApoderado).values({ jugador_id: ajeno, apoderado_id: apo, solicitud_id: s.id });
    await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/aprobar`, cookies, payload: { apoderados: [{ id: apo }] } });
    await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: { vinculos: [{ jugador_id: ajeno, apoderado_id: apo }] },
    });
    expect((await vinculo(ajeno, apo))?.estado).toBe("activo");
    // Mony se arrepiente: el apoderado ya está activo, así que se desactiva desde su ficha; y si
    // hubiera seguido pendiente, rechazarlo borra sus vínculos. Caso pendiente:
    const otra = await familia();
    await db.insert(jugadorApoderado).values({ jugador_id: ajeno, apoderado_id: otra.apo, solicitud_id: otra.s.id, estado: "activo" });
    await app.inject({ method: "POST", url: `/api/panel/solicitudes/${otra.s.id}/rechazar`, cookies, payload: {} });
    expect(await vinculo(ajeno, otra.apo)).toBeUndefined();
    // Era nuevo: se borra (decisión de Ignacio, 2026-11-12). El jugador ajeno sigue.
    expect(await estadoA(otra.apo)).toBeUndefined();
    expect(await estadoJ(ajeno)).toMatchObject({ estado: "activo" });
    await app.close();
  });

  it("segundo apoderado: se decide desde su solicitud o desde la de origen, y las dos se cierran", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    const segunda = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: s.id });
    const otro = await crearApoderado(db, {
      estado: "pendiente",
      origen: "formulario",
      solicitud_id: segunda.id,
      foto_id: await fotoPrueba(db),
    });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: otro, solicitud_id: s.id });

    // Su solicitud muestra su vínculo, aunque lo creó la de origen.
    const d2 = (await app.inject({ method: "GET", url: `/api/panel/solicitudes/${segunda.id}`, cookies })).json();
    expect(d2.vinculos).toEqual([expect.objectContaining({ jugador_id: hijo, apoderado_id: otro })]);

    // Rechazado desde su propia solicitud: el vínculo pendiente en la de origen también se va.
    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${segunda.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(await estadoS(segunda.id)).toBe("revisada");
    expect(await vinculo(hijo, otro)).toBeUndefined();
    // Era nuevo: se borra.
    expect(await estadoA(otro)).toBeUndefined();

    // La de origen se termina de decidir y se cierra.
    await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: {
        apoderados: [{ id: apo }],
        jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "2", ...becas }],
        vinculos: [{ jugador_id: hijo, apoderado_id: apo }],
      },
    });
    expect(await estadoS(s.id)).toBe("revisada");
    await app.close();
  });
});

describe("solicitudes: rechazar vuelve a como estaba", () => {
  it("un precargado rechazado vuelve a precargado con todos sus campos, sin la foto nueva y sin copias", async () => {
    const { app, cookies } = await appConSesion(db);
    const s = await nuevaSolicitud({ coincide_base: true });
    // Precargado de la base: sin teléfono, sin foto, sin número.
    const apo = await crearApoderado(db, { nombre: "Origi", apellido: "Nal", telefono: null });
    const hijo = await crearJugador(db, { nombre: "Peque", numero_camiseta: null });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: apo, estado: "activo" });
    const antesA = await estadoA(apo);
    const antesJ = await estadoJ(hijo);
    // Lo que hace S2: guarda la copia y modifica la ficha.
    await db.insert(fichasPrevias).values([
      {
        solicitud_id: s.id,
        apoderado_id: apo,
        datos: { nombre: "Origi", apellido: "Nal", telefono: null, email: null, metodo_pago: null, foto_id: null, estado: "precargado", solicitud_id: null },
      },
      {
        solicitud_id: s.id,
        jugador_id: hijo,
        datos: {
          nombre: "Peque", apellido: "Ficticia", fecha_nacimiento: "2013-05-10", disciplina: "voleibol", categoria_id: null,
          numero_camiseta: null, telefono: null, email: null, metodo_pago: null, foto_id: null, estado: "precargado",
          solicitud_id: null, marcado_retiro_en: null,
        },
      },
    ]);
    const fotoA = await fotoDeLaSolicitud(s);
    const fotoJ = await fotoDeLaSolicitud(s);
    await db
      .update(apoderados)
      .set({ nombre: "Impostor", telefono: "900000001", foto_id: fotoA, estado: "pendiente", solicitud_id: s.id })
      .where(eq(apoderados.id, apo));
    await db
      .update(jugadores)
      .set({ numero_camiseta: "13", foto_id: fotoJ, estado: "pendiente", solicitud_id: s.id })
      .where(eq(jugadores.id, hijo));
    await db.update(solicitudesRegistro).set({ titular_apoderado_id: apo }).where(eq(solicitudesRegistro.id, s.id));

    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    const sinTiempos = <T extends { actualizado_en: Date }>(f: T | undefined) => f && { ...f, actualizado_en: null };
    expect(sinTiempos(await estadoA(apo))).toEqual(sinTiempos(antesA));
    expect(sinTiempos(await estadoJ(hijo))).toEqual(sinTiempos(antesJ));
    // Las fotos que trajo la solicitud se borraron, y no quedan copias.
    expect(await db.select({ id: fotos.id }).from(fotos).where(inArray(fotos.id, [fotoA, fotoJ]))).toHaveLength(0);
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.solicitud_id, s.id))).toHaveLength(0);
    // El vínculo de la base sigue.
    expect((await vinculo(hijo, apo))?.estado).toBe("activo");
    await app.close();
  });

  it("aprobar borra las copias: no quedan filas en fichas_previas", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    await db.insert(fichasPrevias).values([
      { solicitud_id: s.id, apoderado_id: apo, datos: { telefono: null } },
      { solicitud_id: s.id, jugador_id: hijo, datos: { numero_camiseta: null } },
    ]);
    await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: { apoderados: [{ id: apo }], jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "4", ...becas }] },
    });
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.solicitud_id, s.id))).toHaveLength(0);
    await app.close();
  });

  it("una persona nueva rechazada se borra con su foto, y su RUT queda libre", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    const antes = await estadoJ(hijo);
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/rechazar`,
      cookies,
      payload: { personas: [{ rol: "jugador", id: hijo }] },
    });
    expect(r.statusCode).toBe(200);
    expect(await estadoJ(hijo)).toBeUndefined();
    expect(await db.select().from(fotos).where(eq(fotos.id, antes?.foto_id ?? ""))).toHaveLength(0);
    expect(await vinculo(hijo, apo)).toBeUndefined();
    // El titular sigue pendiente, con su foto, y la solicitud también.
    expect(await estadoA(apo)).toMatchObject({ estado: "pendiente" });
    expect(r.json().estado).toBe("pendiente");
    // El RUT se puede volver a usar.
    await crearJugador(db, { rut: antes?.rut, nombre: "Luis" });
    await app.close();
  });

  it("«Rechazar todo» con un titular nuevo: se borran todos, la solicitud se cierra sin titular", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    const fotosAntes = (await db.select().from(fotos)).length;
    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(await estadoA(apo)).toBeUndefined();
    expect(await estadoJ(hijo)).toBeUndefined();
    expect((await db.select().from(fotos)).length).toBe(fotosAntes - 2);
    const [cerrada] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, s.id));
    expect(cerrada).toMatchObject({ estado: "revisada", titular_apoderado_id: null });
    // El detalle sigue abriendo, sin personas.
    const d = await app.inject({ method: "GET", url: `/api/panel/solicitudes/${s.id}`, cookies });
    expect(d.statusCode).toBe(200);
    expect(d.json()).toMatchObject({ jugadores: [], apoderados: [] });
    await app.close();
  });

  it("si otra solicitud tiene un vínculo hacia la persona nueva, 409 hasta que Mony decida esa otra", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    // Otra familia, ya registrada, nombró a ese hijo por RUT: su solicitud solo tiene ese vínculo.
    const otra = await nuevaSolicitud();
    const otroApo = await crearApoderado(db, { estado: "activo", foto_id: await fotoPrueba(db), credencial_token: generarToken() });
    await db.update(solicitudesRegistro).set({ titular_apoderado_id: otroApo }).where(eq(solicitudesRegistro.id, otra.id));
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: otroApo, solicitud_id: otra.id });
    const rechazarHijo = () =>
      app.inject({
        method: "POST",
        url: `/api/panel/solicitudes/${s.id}/rechazar`,
        cookies,
        payload: { personas: [{ rol: "jugador", id: hijo }] },
      });
    const fotoHijo = (await estadoJ(hijo))?.foto_id;
    if (!fotoHijo) throw new Error("el hijo de la prueba no tiene foto");
    const r = await rechazarHijo();
    expect(r.statusCode).toBe(409);
    expect(r.json().error.mensaje).toMatch(/otra solicitud pendiente \(recibida el \d{2}-\d{2}-\d{4} \d{2}:\d{2}\)/);
    // No cambió nada: ni el hijo y su foto, ni su vínculo con esta, ni el de la otra, ni su estado.
    expect(await estadoJ(hijo)).toMatchObject({ estado: "pendiente" });
    expect(await db.select().from(fotos).where(eq(fotos.id, fotoHijo))).toHaveLength(1);
    expect(await vinculo(hijo, apo)).toBeDefined();
    expect(await vinculo(hijo, otroApo)).toBeDefined();
    expect(await estadoS(otra.id)).toBe("pendiente");
    // Mony decide primero la otra (rechaza su vínculo) y después puede rechazar al hijo.
    const v = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${otra.id}/rechazar`,
      cookies,
      payload: { vinculos: [{ jugador_id: hijo, apoderado_id: otroApo }] },
    });
    expect(v.statusCode).toBe(200);
    expect(await estadoS(otra.id)).toBe("revisada");
    expect((await rechazarHijo()).statusCode).toBe(200);
    expect(await estadoJ(hijo)).toBeUndefined();
    expect(await estadoA(otroApo)).toMatchObject({ estado: "activo" });
    await app.close();
  });

  it("si la persona nueva es titular de otra solicitud pendiente, 409 hasta que Mony decida esa otra", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo } = await familia();
    // El mismo apoderado volvió a llenar el formulario para agregar un hijo olvidado.
    const otra = await nuevaSolicitud({ titular_apoderado_id: apo });
    const olvidado = await crearJugador(db, {
      nombre: "Ema",
      estado: "pendiente",
      origen: "formulario",
      solicitud_id: otra.id,
      foto_id: await fotoPrueba(db),
    });
    await db.insert(jugadorApoderado).values({ jugador_id: olvidado, apoderado_id: apo, solicitud_id: otra.id });
    const rechazarTodo = () => app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload: {} });
    expect((await rechazarTodo()).statusCode).toBe(409);
    expect(await estadoA(apo)).toMatchObject({ estado: "pendiente" });
    expect(await estadoJ(olvidado)).toMatchObject({ estado: "pendiente" });
    // Decidida la otra (se rechaza a la hija nueva, que se borra), ya se puede rechazar todo.
    expect((await app.inject({ method: "POST", url: `/api/panel/solicitudes/${otra.id}/rechazar`, cookies, payload: {} })).statusCode).toBe(200);
    expect(await estadoJ(olvidado)).toBeUndefined();
    expect((await rechazarTodo()).statusCode).toBe(200);
    expect(await estadoA(apo)).toBeUndefined();
    const [cerrada] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, otra.id));
    expect(cerrada).toMatchObject({ estado: "revisada", titular_apoderado_id: null });
    await app.close();
  });

  it("si la persona nueva es titular de otra solicitud pendiente sin ningún vínculo de ella, también 409", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo } = await familia();
    // La otra solicitud solo agregó un segundo apoderado: no tiene vínculos hacia `apo`.
    const otra = await nuevaSolicitud({ titular_apoderado_id: apo });
    const rechazarApo = () =>
      app.inject({
        method: "POST",
        url: `/api/panel/solicitudes/${s.id}/rechazar`,
        cookies,
        payload: { personas: [{ rol: "apoderado", id: apo }] },
      });
    const bloqueado = await rechazarApo();
    expect(bloqueado.statusCode).toBe(409);
    expect(bloqueado.json().error.mensaje).toMatch(/otra solicitud pendiente \(recibida el/);
    expect(await estadoA(apo)).toMatchObject({ estado: "pendiente" });
    // Decidida la otra, ya se puede.
    await db.update(solicitudesRegistro).set({ estado: "revisada", revisada_en: new Date() }).where(eq(solicitudesRegistro.id, otra.id));
    expect((await rechazarApo()).statusCode).toBe(200);
    expect(await estadoA(apo)).toBeUndefined();
    await app.close();
  });

  it("un jugador adulto nuevo que llenó la solicitud se borra y la solicitud queda sin titular", async () => {
    const { app, cookies } = await appConSesion(db);
    const s = await nuevaSolicitud();
    const adulto = await crearJugador(db, {
      nombre: "Ana",
      estado: "pendiente",
      origen: "formulario",
      solicitud_id: s.id,
      foto_id: await fotoPrueba(db),
    });
    await db.update(solicitudesRegistro).set({ titular_jugador_id: adulto }).where(eq(solicitudesRegistro.id, s.id));
    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(await estadoJ(adulto)).toBeUndefined();
    const [cerrada] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, s.id));
    expect(cerrada).toMatchObject({ estado: "revisada", titular_jugador_id: null });
    await app.close();
  });

});

describe("solicitudes: dos solicitudes sobre un precargado y casos sin copia", () => {
  /** Hijo precargado sin apoderado que la solicitud X completó (S2 lo deja pendiente sin solicitud). */
  async function hijoCompletadoPor(x: { s: { id: string; creada_en: Date }; apo: string }) {
    const hijo = await crearJugador(db, { nombre: "Solo", numero_camiseta: null });
    await db.insert(fichasPrevias).values({
      solicitud_id: x.s.id,
      jugador_id: hijo,
      datos: { numero_camiseta: null, foto_id: null, estado: "precargado", solicitud_id: null },
    });
    await db
      .update(jugadores)
      .set({ numero_camiseta: "8", foto_id: await fotoDeLaSolicitud(x.s), estado: "pendiente" })
      .where(eq(jugadores.id, hijo));
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: x.apo, solicitud_id: x.s.id });
    return hijo;
  }

  it("el pendiente sin solicitud es propio solo de la solicitud que escribió su copia", async () => {
    const { app, cookies } = await appConSesion(db);
    const x = await familia();
    const y = await familia();
    const hijo = await hijoCompletadoPor(x);
    // Y lo nombra después: S2 solo crea el vínculo.
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: y.apo, solicitud_id: y.s.id });

    const desdeY = (accion: string, payload: object) =>
      app.inject({ method: "POST", url: `/api/panel/solicitudes/${y.s.id}/${accion}`, cookies, payload });
    expect(
      (await desdeY("aprobar", { jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "8", ...becas }] })).statusCode,
    ).toBe(409);
    expect((await desdeY("rechazar", { personas: [{ rol: "jugador", id: hijo }] })).statusCode).toBe(409);
    // El rechazo total de Y solo quita su vínculo: el hijo y su copia siguen para X.
    expect((await desdeY("rechazar", {})).statusCode).toBe(200);
    expect((await estadoJ(hijo))?.estado).toBe("pendiente");
    expect(await vinculo(hijo, y.apo)).toBeUndefined();
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.jugador_id, hijo))).toHaveLength(1);

    // Desde X sí: se rechaza y vuelve a como estaba.
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${x.s.id}/rechazar`,
      cookies,
      payload: { personas: [{ rol: "jugador", id: hijo }] },
    });
    expect(r.statusCode).toBe(200);
    expect(await estadoJ(hijo)).toMatchObject({ estado: "precargado", numero_camiseta: null, foto_id: null });
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.jugador_id, hijo))).toHaveLength(0);
    await app.close();
  });

  it("sin copia, a un precargado de la base no se lo rechaza: 409 y su ficha no cambia", async () => {
    const { app, cookies } = await appConSesion(db);
    const s = await nuevaSolicitud();
    const apo = await crearApoderado(db, { estado: "pendiente", origen: "base_2026", solicitud_id: s.id, foto_id: await fotoPrueba(db) });
    await db.update(solicitudesRegistro).set({ titular_apoderado_id: apo }).where(eq(solicitudesRegistro.id, s.id));
    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.mensaje).toContain("no hay registro de cómo estaba");
    expect((await estadoA(apo))?.estado).toBe("pendiente");
    await app.close();
  });

  it("una copia que no es de un precargado no se restaura: 409", async () => {
    const { app, cookies } = await appConSesion(db);
    const s = await nuevaSolicitud();
    const apo = await crearApoderado(db, { estado: "pendiente", origen: "base_2026", solicitud_id: s.id, foto_id: await fotoPrueba(db) });
    await db.insert(fichasPrevias).values({ solicitud_id: s.id, apoderado_id: apo, datos: { estado: "activo" } });
    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(409);
    expect((await estadoA(apo))).toMatchObject({ estado: "pendiente", credencial_token: null });
    await app.close();
  });

  it("un vínculo hacia un precargado de otra familia dice cómo seguir", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo } = await familia();
    const ajeno = await crearJugador(db);
    await db.insert(jugadorApoderado).values({ jugador_id: ajeno, apoderado_id: apo, solicitud_id: s.id });
    await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/aprobar`, cookies, payload: { apoderados: [{ id: apo }] } });
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: { vinculos: [{ jugador_id: ajeno, apoderado_id: apo }] },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.mensaje).toBe(
      "El jugador de ese vínculo está precargado: complétalo y actívalo en su ficha antes de aprobar el vínculo",
    );
    await app.close();
  });
});

describe("solicitudes: link", () => {
  it("link nuevo: anula el anterior, apunta a /familia o /completar y no se guarda en caché", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s } = await familia();
    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/link`, cookies });
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const m = /^https:\/\/panel\.ejemplo\.test\/familia\/([A-Za-z0-9_-]{43})$/.exec(r.json().url);
    expect(m).not.toBeNull();
    const [fila] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, s.id));
    expect(fila?.token_acceso_hash).toBe(hashToken(m?.[1] ?? ""));

    const segunda = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: s.id, consentimiento_en: null });
    const r2 = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${segunda.id}/link`, cookies });
    expect(r2.json().url).toMatch(/^https:\/\/panel\.ejemplo\.test\/completar\/[A-Za-z0-9_-]{43}$/);
    expect(
      (await app.inject({ method: "POST", url: "/api/panel/solicitudes/00000000-0000-4000-8000-000000000000/link", cookies })).statusCode,
    ).toBe(404);
    await app.close();
  });
});

describe("solicitudes: pedidos de S2 (#25) y rechazo de un vínculo", () => {
  it("restaura la copia como la escribe S2: la marca 'ya no está' de después no se pisa y se conserva la foto que Mony cambió", async () => {
    const { app, cookies } = await appConSesion(db);
    const s = await nuevaSolicitud();
    const marcadoEn = new Date("2026-10-01T15:30:00.000Z");
    const fotoBase = await fotoPrueba(db);
    const hijo = await crearJugador(db, { foto_id: fotoBase });
    const antes = await estadoJ(hijo);
    if (!antes) throw new Error("sin jugador");
    // Las 13 llaves, con la fecha como texto ISO, igual que copiaPrevia de S2.
    await db.insert(fichasPrevias).values({
      solicitud_id: s.id,
      jugador_id: hijo,
      datos: {
        nombre: antes.nombre, apellido: antes.apellido, fecha_nacimiento: antes.fecha_nacimiento,
        disciplina: antes.disciplina, categoria_id: antes.categoria_id, numero_camiseta: antes.numero_camiseta,
        telefono: antes.telefono, email: antes.email, metodo_pago: antes.metodo_pago, foto_id: fotoBase,
        estado: "precargado", solicitud_id: null, marcado_retiro_en: null,
      },
    });
    await db
      .update(jugadores)
      // Después de la copia, otra solicitud lo marcó "ya no está": la marca es solo una señal y no
      // se deshace al rechazar esta.
      .set({ numero_camiseta: "21", estado: "pendiente", solicitud_id: s.id, marcado_retiro_en: marcadoEn })
      .where(eq(jugadores.id, hijo));
    // Mony cambia la foto en el panel: la de la base se borra y la copia apunta a una que no existe.
    const cambio = await app.inject({
      method: "POST",
      url: `/api/panel/jugadores/${hijo}/foto`,
      cookies,
      ...multipart([{ nombre: "foto", archivo: JPEG_PRUEBA }]),
    });
    expect(cambio.statusCode).toBe(200);
    const fotoMony = (await estadoJ(hijo))?.foto_id;
    expect(await db.select().from(fotos).where(eq(fotos.id, fotoBase))).toHaveLength(0);

    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    const despues = await estadoJ(hijo);
    // La foto la cambió Mony después de la solicitud: se conserva (decisión de Ignacio, 2026-11-12).
    expect(despues).toMatchObject({ estado: "precargado", solicitud_id: null, numero_camiseta: antes.numero_camiseta, foto_id: fotoMony });
    expect(despues?.marcado_retiro_en).toBeInstanceOf(Date);
    expect(despues?.marcado_retiro_en?.toISOString()).toBe(marcadoEn.toISOString());
    expect(await db.select().from(fotos).where(eq(fotos.id, fotoMony ?? ""))).toHaveLength(1);
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.jugador_id, hijo))).toHaveLength(0);
    await app.close();
  });

  it.each(["rechazar", "aprobar"] as const)("%s espera el candado de S2 antes de tocar fichas_previas", async (accion) => {
    const { app, cookies } = await appConSesion(db);
    const otraConexion = dbTest();
    const { s, apo } = await familia();
    let soltar = () => {};
    const suelto = new Promise<void>((ok) => (soltar = ok));
    let avisarTomado = () => {};
    const tomado = new Promise<void>((ok) => (avisarTomado = ok));
    const candado = otraConexion.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${CANDADO_SOLICITUDES})`);
      avisarTomado();
      await suelto;
    });
    try {
      await tomado;
      let terminado = false;
      const pedido = app
        .inject({
          method: "POST",
          url: `/api/panel/solicitudes/${s.id}/${accion}`,
          cookies,
          payload: accion === "rechazar" ? { personas: [{ rol: "apoderado", id: apo }] } : { apoderados: [{ id: apo }] },
        })
        .then((r) => {
          terminado = true;
          return r;
        });
      await new Promise((ok) => setTimeout(ok, 300));
      expect(terminado).toBe(false);
      expect((await estadoA(apo))?.estado).toBe("pendiente");
      soltar();
      await candado;
      expect((await pedido).statusCode).toBe(200);
      // Rechazado, el apoderado nuevo se borra.
      expect((await estadoA(apo))?.estado).toBe(accion === "rechazar" ? undefined : "activo");
    } finally {
      soltar();
      await candado.catch(() => {});
      await otraConexion.cerrar();
      await app.close();
    }
  });

  it("rechazar solo el vínculo de un precargado completado por RUT lo devuelve a como estaba", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo } = await familia();
    // Precargado sin apoderado, nombrado por RUT: S2 copia, completa la foto y lo deja pendiente
    // sin solicitud_id, con un vínculo pendiente de esta solicitud.
    const hijo = await crearJugador(db, { numero_camiseta: "4" });
    const antes = await estadoJ(hijo);
    await db.insert(fichasPrevias).values({
      solicitud_id: s.id,
      jugador_id: hijo,
      datos: { foto_id: null, estado: "precargado", solicitud_id: null, marcado_retiro_en: null },
    });
    const fotoS2 = await fotoDeLaSolicitud(s);
    await db.update(jugadores).set({ foto_id: fotoS2, estado: "pendiente" }).where(eq(jugadores.id, hijo));
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: apo, solicitud_id: s.id });

    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/rechazar`,
      cookies,
      payload: { vinculos: [{ jugador_id: hijo, apoderado_id: apo }] },
    });
    expect(r.statusCode).toBe(200);
    const sinTiempos = <T extends { actualizado_en: Date }>(f: T | undefined) => f && { ...f, actualizado_en: null };
    expect(sinTiempos(await estadoJ(hijo))).toEqual(sinTiempos(antes));
    expect(await db.select().from(fotos).where(eq(fotos.id, fotoS2))).toHaveLength(0);
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.jugador_id, hijo))).toHaveLength(0);
    // El titular sigue pendiente: solo se decidió el vínculo.
    expect(await estadoA(apo)).toMatchObject({ estado: "pendiente" });

    // Lo mismo si se rechaza solo al titular: su vínculo se va y el hijo completado vuelve atrás.
    const otra = await familia();
    const hijo2 = await crearJugador(db, { numero_camiseta: "5" });
    await db.insert(fichasPrevias).values({
      solicitud_id: otra.s.id,
      jugador_id: hijo2,
      datos: { foto_id: null, estado: "precargado", solicitud_id: null },
    });
    await db.update(jugadores).set({ foto_id: await fotoDeLaSolicitud(otra.s), estado: "pendiente" }).where(eq(jugadores.id, hijo2));
    await db.insert(jugadorApoderado).values({ jugador_id: hijo2, apoderado_id: otra.apo, solicitud_id: otra.s.id });
    const r2 = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${otra.s.id}/rechazar`,
      cookies,
      payload: { personas: [{ rol: "apoderado", id: otra.apo }] },
    });
    expect(r2.statusCode).toBe(200);
    expect(await estadoJ(hijo2)).toMatchObject({ estado: "precargado", foto_id: null });
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.jugador_id, hijo2))).toHaveLength(0);
    await app.close();
  });

  it("un vínculo pendiente se rechaza solo: se borra y sus personas siguen pendientes", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    const ajeno = await crearJugadorActivo(db);
    await db.insert(jugadorApoderado).values({ jugador_id: ajeno, apoderado_id: apo, solicitud_id: s.id });
    const rechazar = (payload: object) =>
      app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload });

    let r = await rechazar({ vinculos: [{ jugador_id: ajeno, apoderado_id: apo }] });
    expect(r.statusCode).toBe(200);
    expect(await vinculo(ajeno, apo)).toBeUndefined();
    expect((await vinculo(hijo, apo))?.estado).toBe("pendiente");
    expect(await estadoA(apo)).toMatchObject({ estado: "pendiente" });
    expect(await estadoJ(hijo)).toMatchObject({ estado: "pendiente" });
    expect(await estadoJ(ajeno)).toMatchObject({ estado: "activo" });
    expect(r.json().estado).toBe("pendiente");

    // Ya no está: 409. Un vínculo de otra solicitud o uno ya activo tampoco se rechazan desde aquí.
    expect((await rechazar({ vinculos: [{ jugador_id: ajeno, apoderado_id: apo }] })).statusCode).toBe(409);
    const otra = await familia();
    expect((await rechazar({ vinculos: [{ jugador_id: otra.hijo, apoderado_id: otra.apo }] })).statusCode).toBe(409);
    expect((await vinculo(otra.hijo, otra.apo))?.estado).toBe("pendiente");
    const activo = await crearJugadorActivo(db);
    await db.insert(jugadorApoderado).values({ jugador_id: activo, apoderado_id: apo, solicitud_id: s.id, estado: "activo" });
    expect((await rechazar({ vinculos: [{ jugador_id: activo, apoderado_id: apo }] })).statusCode).toBe(409);
    expect((await vinculo(activo, apo))?.estado).toBe("activo");

    // Personas y vínculo en el mismo pedido: si algo no corresponde, no se hace nada.
    expect(
      (await rechazar({ personas: [{ rol: "jugador", id: hijo }], vinculos: [{ jugador_id: otra.hijo, apoderado_id: otra.apo }] })).statusCode,
    ).toBe(409);
    expect(await estadoJ(hijo)).toMatchObject({ estado: "pendiente" });

    // Aprobadas las personas, rechazar el último vínculo pendiente cierra la solicitud.
    await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: { apoderados: [{ id: apo }], jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "8", ...becas }] },
    });
    expect(await estadoS(s.id)).toBe("pendiente");
    r = await rechazar({ vinculos: [{ jugador_id: hijo, apoderado_id: apo }] });
    expect(r.statusCode).toBe(200);
    expect(await estadoS(s.id)).toBe("revisada");
    expect(await estadoA(apo)).toMatchObject({ estado: "activo" });
    await app.close();
  });

  it("segundo apoderado: su vínculo, creado por la solicitud de origen, se rechaza desde la suya", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, hijo } = await familia();
    const segunda = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: s.id });
    const otro = await crearApoderado(db, { estado: "pendiente", origen: "formulario", solicitud_id: segunda.id, foto_id: await fotoPrueba(db) });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: otro, solicitud_id: s.id });
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${segunda.id}/rechazar`,
      cookies,
      payload: { vinculos: [{ jugador_id: hijo, apoderado_id: otro }] },
    });
    expect(r.statusCode).toBe(200);
    expect(await vinculo(hijo, otro)).toBeUndefined();
    expect(await estadoA(otro)).toMatchObject({ estado: "pendiente" });
    await app.close();
  });

  it("segundo apoderado ya activo: «Rechazar todo» desde su solicitud borra el vínculo pendiente que creó el origen", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    const segunda = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: s.id });
    const otro = await crearApoderado(db, {
      estado: "activo",
      origen: "formulario",
      solicitud_id: segunda.id,
      foto_id: await fotoPrueba(db),
      credencial_token: generarToken(),
    });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: otro, solicitud_id: s.id });
    // Un vínculo del origen hacia él que ya estaba activo no es pendiente: sobrevive.
    const hijo2 = await crearJugador(db, { nombre: "Ana" });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo2, apoderado_id: otro, solicitud_id: s.id, estado: "activo" });
    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${segunda.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(await vinculo(hijo, otro)).toBeUndefined();
    expect((await vinculo(hijo2, otro))?.estado).toBe("activo");
    // El vínculo del titular con su hijo es del origen y no está en este detalle: no se toca.
    expect((await vinculo(hijo, apo))?.estado).toBe("pendiente");
    // Él ya estaba activo y no es de esta decisión: sigue activo. El hijo, de la solicitud de origen, no se toca.
    expect(await estadoA(otro)).toMatchObject({ estado: "activo" });
    expect(await estadoJ(hijo)).toMatchObject({ estado: "pendiente" });
    const estado = async (id: string) =>
      (await db.select({ e: solicitudesRegistro.estado }).from(solicitudesRegistro).where(eq(solicitudesRegistro.id, id)))[0]?.e;
    expect(await estado(segunda.id)).toBe("revisada");
    expect(await estado(s.id)).toBe("pendiente");
    await app.close();
  });

  it("segundo apoderado: si «Rechazar todo» deja suelto a un precargado que completó el origen, vuelve a como estaba", async () => {
    const { app, cookies } = await appConSesion(db);
    const s = await nuevaSolicitud({ coincide_base: true });
    const segunda = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: s.id });
    const otro = await crearApoderado(db, {
      estado: "activo",
      origen: "formulario",
      solicitud_id: segunda.id,
      foto_id: await fotoPrueba(db),
      credencial_token: generarToken(),
    });
    // Lo que hace S2 con un hijo precargado sin apoderado nombrado por RUT: copia, lo completa y lo
    // deja pendiente sin solicitud_id. Su único vínculo que queda es el del otro apoderado (Mony ya
    // rechazó el del titular desde el origen).
    const huerfano = await crearJugador(db, { nombre: "Peque", numero_camiseta: null });
    const antes = await estadoJ(huerfano);
    await db.insert(fichasPrevias).values({
      solicitud_id: s.id,
      jugador_id: huerfano,
      datos: { numero_camiseta: null, foto_id: null, estado: "precargado", solicitud_id: null, marcado_retiro_en: null },
    });
    const fotoS2 = await fotoDeLaSolicitud(s);
    await db.update(jugadores).set({ numero_camiseta: "5", foto_id: fotoS2, estado: "pendiente" }).where(eq(jugadores.id, huerfano));
    await db.insert(jugadorApoderado).values({ jugador_id: huerfano, apoderado_id: otro, solicitud_id: s.id });

    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${segunda.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(await vinculo(huerfano, otro)).toBeUndefined();
    const sinTiempos = <T extends { actualizado_en: Date }>(f: T | undefined) => f && { ...f, actualizado_en: null };
    expect(sinTiempos(await estadoJ(huerfano))).toEqual(sinTiempos(antes));
    expect(await db.select({ id: fotos.id }).from(fotos).where(eq(fotos.id, fotoS2))).toHaveLength(0);
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.jugador_id, huerfano))).toHaveLength(0);
    await app.close();
  });

  it("segundo apoderado: un precargado del origen que conserva el vínculo con el titular no se toca", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo } = await familia();
    const segunda = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: s.id });
    const otro = await crearApoderado(db, {
      estado: "activo",
      origen: "formulario",
      solicitud_id: segunda.id,
      foto_id: await fotoPrueba(db),
      credencial_token: generarToken(),
    });
    const huerfano = await crearJugador(db, { nombre: "Peque", numero_camiseta: null });
    await db.insert(fichasPrevias).values({
      solicitud_id: s.id,
      jugador_id: huerfano,
      datos: { numero_camiseta: null, foto_id: null, estado: "precargado", solicitud_id: null, marcado_retiro_en: null },
    });
    await db.update(jugadores).set({ numero_camiseta: "5", estado: "pendiente" }).where(eq(jugadores.id, huerfano));
    await db.insert(jugadorApoderado).values([
      { jugador_id: huerfano, apoderado_id: apo, solicitud_id: s.id },
      { jugador_id: huerfano, apoderado_id: otro, solicitud_id: s.id },
    ]);
    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${segunda.id}/rechazar`, cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(await vinculo(huerfano, otro)).toBeUndefined();
    expect((await vinculo(huerfano, apo))?.estado).toBe("pendiente");
    expect(await estadoJ(huerfano)).toMatchObject({ estado: "pendiente", numero_camiseta: "5" });
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.jugador_id, huerfano))).toHaveLength(1);
    await app.close();
  });

  it("jugador adulto sin teléfono: su contacto es un apoderado activo con el vínculo aprobado, en el mismo pedido sirve", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    await db.update(jugadores).set({ fecha_nacimiento: "1990-01-01", telefono: null }).where(eq(jugadores.id, hijo));
    const jugador = { id: hijo, categoria_id: null, numero_camiseta: "9", ...becas };
    const vinculos = [{ jugador_id: hijo, apoderado_id: apo }];
    const aprobar = (payload: object) =>
      app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/aprobar`, cookies, payload });
    for (const payload of [
      { jugadores: [jugador] },
      // Apoderado aprobado, pero el vínculo no: no es contacto, y no se aprueba nada.
      { apoderados: [{ id: apo }], jugadores: [jugador] },
    ]) {
      const r = await aprobar(payload);
      expect(r.statusCode).toBe(422);
      expect(r.json().error.mensaje).toContain("telefono");
      expect(await estadoA(apo)).toMatchObject({ estado: "pendiente" });
    }
    const r = await aprobar({ apoderados: [{ id: apo }], jugadores: [jugador], vinculos });
    expect(r.statusCode).toBe(200);
    expect(await estadoJ(hijo)).toMatchObject({ estado: "activo" });
    expect((await vinculo(hijo, apo))?.estado).toBe("activo");
    await app.close();
  });
});

describe("solicitudes: fotos al restaurar, propia y topes", () => {
  it.each([
    ["sin cambios de Mony: se borran las fotos que trajo el formulario", false],
    ["Mony cambió la foto del hijo en el panel: se conserva la suya", true],
  ] as const)("de punta a punta con el formulario de S2, %s", async (_caso, monyCambia) => {
    const { app, cookies } = await appConSesion(db);
    // Precargados de la base, sin foto: el titular y su hijo, con su vínculo.
    const titular = await crearApoderado(db, { nombre: "Rosa", apellido: "Ficticia", telefono: "911111111" });
    const hijo = await crearJugador(db, { nombre: "Tomás Andrés", numero_camiseta: null });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: titular, estado: "activo" });
    const rut = (await estadoA(titular))?.rut;
    const antesA = await estadoA(titular);
    const antesJ = await estadoJ(hijo);
    const form = new FormData();
    form.append(
      "datos",
      JSON.stringify({
        rut,
        tipo: "apoderado",
        consentimiento: true,
        nombre: "Rosa",
        apellido: "Ficticia",
        telefono: "911111111",
        foto: "titular",
        paga_mensualidad: false,
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, numero_camiseta: "7", foto: "h0" }],
      }),
    );
    for (const clave of ["titular", "h0"]) {
      form.append(`foto_${clave}`, new Blob([new Uint8Array(JPEG_PRUEBA)], { type: "image/jpeg" }), `${clave}.jpg`);
    }
    const enviada = await app.inject({
      method: "POST",
      url: API.public.solicitudes,
      payload: form,
      headers: { "x-real-ip": "198.51.100.77" },
    });
    expect(enviada.statusCode).toBe(201);
    const fotoTitularS2 = (await estadoA(titular))?.foto_id;
    const fotoHijoS2 = (await estadoJ(hijo))?.foto_id;
    expect(fotoTitularS2).toBeTruthy();
    expect(fotoHijoS2).toBeTruthy();
    const [s] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.titular_apoderado_id, titular));
    if (!s) throw new Error("sin solicitud");

    let fotoMony: string | null | undefined = null;
    if (monyCambia) {
      const r = await app.inject({
        method: "POST",
        url: API.panel.foto("jugadores", hijo),
        cookies,
        ...multipart([{ nombre: "foto", archivo: JPEG_PRUEBA }]),
      });
      expect(r.statusCode).toBe(200);
      fotoMony = (await estadoJ(hijo))?.foto_id;
    }

    const r = await app.inject({ method: "POST", url: API.panel.rechazar(s.id), cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    const sinTiempos = <T extends { actualizado_en: Date }>(f: T | undefined) => f && { ...f, actualizado_en: null };
    expect(sinTiempos(await estadoA(titular))).toEqual(sinTiempos(antesA));
    expect(sinTiempos(await estadoJ(hijo))).toEqual(sinTiempos({ ...antesJ!, foto_id: fotoMony ?? null }));
    const quedan = async (id: string | null | undefined) =>
      (await db.select({ id: fotos.id }).from(fotos).where(eq(fotos.id, id ?? ""))).length;
    // La foto que trajo la solicitud se borra siempre; la de Mony, nunca.
    expect(await quedan(fotoTitularS2)).toBe(0);
    expect(await quedan(fotoHijoS2)).toBe(0);
    if (monyCambia) expect(await quedan(fotoMony)).toBe(1);
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.solicitud_id, s.id))).toHaveLength(0);
    await app.close();
  });

  it("la copia con foto vuelve con su foto y se borra la que trajo la solicitud", async () => {
    const { app, cookies } = await appConSesion(db);
    const s = await nuevaSolicitud();
    const fotoBase = await fotoPrueba(db);
    const apo = await crearApoderado(db, { foto_id: fotoBase });
    await db.insert(fichasPrevias).values({
      solicitud_id: s.id,
      apoderado_id: apo,
      datos: { foto_id: fotoBase, estado: "precargado", solicitud_id: null },
    });
    const fotoS2 = await fotoDeLaSolicitud(s);
    await db.update(apoderados).set({ foto_id: fotoS2, estado: "pendiente", solicitud_id: s.id }).where(eq(apoderados.id, apo));
    expect((await app.inject({ method: "POST", url: API.panel.rechazar(s.id), cookies, payload: {} })).statusCode).toBe(200);
    expect(await estadoA(apo)).toMatchObject({ estado: "precargado", foto_id: fotoBase });
    expect(await db.select().from(fotos).where(eq(fotos.id, fotoS2))).toHaveLength(0);
    await app.close();
  });

  it("el detalle marca propia a quien se decide desde esta solicitud", async () => {
    const { app, cookies } = await appConSesion(db);
    const x = await familia();
    const y = await familia();
    // Y nombra por RUT al hijo de X: en Y se muestra, pero se decide desde X.
    await db.insert(jugadorApoderado).values({ jugador_id: x.hijo, apoderado_id: y.apo, solicitud_id: y.s.id });
    const propias = async (id: string) => {
      const d = (await app.inject({ method: "GET", url: API.panel.solicitud(id), cookies })).json();
      return {
        jugadores: Object.fromEntries(d.jugadores.map((j: { id: string; propia: boolean }) => [j.id, j.propia])),
        apoderados: Object.fromEntries(d.apoderados.map((a: { id: string; propia: boolean }) => [a.id, a.propia])),
      };
    };
    expect(await propias(y.s.id)).toEqual({
      jugadores: { [y.hijo]: true, [x.hijo]: false },
      apoderados: { [y.apo]: true },
    });
    expect(await propias(x.s.id)).toEqual({ jugadores: { [x.hijo]: true }, apoderados: { [x.apo]: true } });
    // Ya activo, el titular sigue siendo de su solicitud; un titular que ya era activo de antes, no.
    const z = await nuevaSolicitud();
    const activo = await crearApoderado(db, { estado: "activo", credencial_token: generarToken(), foto_id: await fotoPrueba(db) });
    await db.update(solicitudesRegistro).set({ titular_apoderado_id: activo }).where(eq(solicitudesRegistro.id, z.id));
    expect((await propias(z.id)).apoderados).toEqual({ [activo]: false });
    await app.close();
  });

  it("aprobar y rechazar aceptan hasta 50 por arreglo: más es 400 y no cambia nada", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo } = await familia();
    const muchos = Array.from({ length: 51 }, () => ({ id: apo }));
    const vinculos = Array.from({ length: 51 }, () => ({ jugador_id: apo, apoderado_id: apo }));
    for (const [accion, payload] of [
      ["aprobar", { apoderados: muchos }],
      ["aprobar", { vinculos }],
      ["rechazar", { vinculos }],
      ["rechazar", { personas: muchos.map((m) => ({ rol: "apoderado", ...m })) }],
    ] as const) {
      const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/${accion}`, cookies, payload });
      expect(r.statusCode, `${accion}`).toBe(400);
      expect(r.json().error.codigo).toBe("validacion");
    }
    expect(await estadoA(apo)).toMatchObject({ estado: "pendiente" });
    // 50 sí pasa la validación (y choca después: no son de la solicitud).
    const cincuenta = Array.from({ length: 50 }, () => ({ jugador_id: apo, apoderado_id: apo }));
    for (const accion of ["aprobar", "rechazar"] as const) {
      const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/${accion}`, cookies, payload: { vinculos: cincuenta } });
      expect(r.statusCode, accion).toBe(409);
    }
    await app.close();
  });
});

describe("solicitudes: paga_mensualidad de un vínculo de la base", () => {
  async function enviar(app: Awaited<ReturnType<typeof appConSesion>>["app"], rut: string | undefined, paga: boolean, ip: string) {
    const form = new FormData();
    form.append(
      "datos",
      JSON.stringify({
        rut,
        tipo: "apoderado",
        consentimiento: true,
        telefono: "911111111",
        foto: "titular",
        paga_mensualidad: paga,
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, numero_camiseta: "7", foto: "h0" }],
      }),
    );
    for (const clave of ["titular", "h0"]) {
      form.append(`foto_${clave}`, new Blob([new Uint8Array(JPEG_PRUEBA)], { type: "image/jpeg" }), `${clave}.jpg`);
    }
    return app.inject({ method: "POST", url: API.public.solicitudes, payload: form, headers: { "x-real-ip": ip } });
  }

  it("rechazar al titular devuelve el valor que tenía el vínculo de la base", async () => {
    const { app, cookies } = await appConSesion(db);
    const titular = await crearApoderado(db, { nombre: "Rosa", apellido: "Ficticia", telefono: "911111111" });
    const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: null });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: titular, estado: "activo", paga_mensualidad: true });
    const rut = (await estadoA(titular))?.rut;
    expect((await enviar(app, rut, false, "198.51.100.80")).statusCode).toBe(201);
    expect((await vinculo(hijo, titular))?.paga_mensualidad).toBe(false);
    // La forma que comparten S1 y S2: el valor anterior por jugador, en la copia del titular.
    const [copia] = await db.select().from(fichasPrevias).where(eq(fichasPrevias.apoderado_id, titular));
    expect(copia?.datos).toMatchObject({ vinculos_paga: { [hijo]: true } });
    const [s] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.titular_apoderado_id, titular));
    if (!s) throw new Error("sin solicitud");
    const r = await app.inject({ method: "POST", url: API.panel.rechazar(s.id), cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    expect(await vinculo(hijo, titular)).toMatchObject({ paga_mensualidad: true, estado: "activo" });
    expect(await estadoA(titular)).toMatchObject({ estado: "precargado" });
    await app.close();
  });
});

describe("solicitudes: un hijo marcado 'ya no está' y las copias al cerrar", () => {
  async function marcarDesdeElFormulario(app: Awaited<ReturnType<typeof appConSesion>>["app"]) {
    const titular = await crearApoderado(db, { nombre: "Rosa", apellido: "Ficticia", telefono: "911111111" });
    const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: null });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: titular, estado: "activo" });
    const antesA = await estadoA(titular);
    const antesJ = await estadoJ(hijo);
    const form = new FormData();
    form.append(
      "datos",
      JSON.stringify({
        rut: antesA?.rut,
        tipo: "apoderado",
        consentimiento: true,
        telefono: "911111111",
        foto: "titular",
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, ya_no_esta: true }],
      }),
    );
    form.append("foto_titular", new Blob([new Uint8Array(JPEG_PRUEBA)], { type: "image/jpeg" }), "titular.jpg");
    const r = await app.inject({ method: "POST", url: API.public.solicitudes, payload: form, headers: { "x-real-ip": "198.51.100.78" } });
    expect(r.statusCode).toBe(201);
    expect((await estadoJ(hijo))?.marcado_retiro_en).not.toBeNull();
    const [s] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.titular_apoderado_id, titular));
    if (!s) throw new Error("sin solicitud");
    return { s, titular, hijo, antesA, antesJ };
  }

  const copiasDe = (hijo: string) => db.select().from(fichasPrevias).where(eq(fichasPrevias.jugador_id, hijo));
  const sinTiempos = <T extends { actualizado_en: Date }>(f: T | undefined) => f && { ...f, actualizado_en: null };

  it("«Rechazar todo» no deja copias ni quita la marca, que Mony decide en la ficha", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, titular, hijo, antesA, antesJ } = await marcarDesdeElFormulario(app);
    const r = await app.inject({ method: "POST", url: API.panel.rechazar(s.id), cookies, payload: {} });
    expect(r.statusCode).toBe(200);
    const despues = await estadoJ(hijo);
    expect(despues?.marcado_retiro_en).not.toBeNull();
    expect(sinTiempos(despues && { ...despues, marcado_retiro_en: null })).toEqual(sinTiempos(antesJ));
    expect(sinTiempos(await estadoA(titular))).toEqual(sinTiempos(antesA));
    expect(await copiasDe(hijo)).toHaveLength(0);
    await app.close();
  });

  it("aprobar no quita la marca; si Mony la quita, otra solicitud puede completar al hijo", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, titular, hijo, antesA } = await marcarDesdeElFormulario(app);
    const aprobada = await app.inject({
      method: "POST",
      url: API.panel.aprobar(s.id),
      cookies,
      payload: { apoderados: [{ id: titular, metodo_pago: "forpay_mensual" }] },
    });
    expect(aprobada.statusCode).toBe(200);
    const [cerrada] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, s.id));
    expect(cerrada?.estado).toBe("revisada");
    expect(await copiasDe(hijo)).toHaveLength(0);
    // La marca la decide Mony: aprobar no la quita.
    expect((await estadoJ(hijo))?.marcado_retiro_en).not.toBeNull();
    expect((await app.inject({ method: "DELETE", url: API.panel.marcaRetiro(hijo), cookies })).statusCode).toBe(200);

    const form = new FormData();
    form.append(
      "datos",
      JSON.stringify({
        rut: antesA?.rut,
        tipo: "apoderado",
        consentimiento: true,
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, numero_camiseta: "7", foto: "h0" }],
      }),
    );
    form.append("foto_h0", new Blob([new Uint8Array(JPEG_PRUEBA)], { type: "image/jpeg" }), "h0.jpg");
    const otra = await app.inject({ method: "POST", url: API.public.solicitudes, payload: form, headers: { "x-real-ip": "198.51.100.79" } });
    expect(otra.statusCode).toBe(201);
    const [nueva] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.estado, "pendiente"));
    expect(nueva?.avisos).not.toContain("cambios_bloqueados_por_otra_solicitud");
    expect(await estadoJ(hijo)).toMatchObject({ numero_camiseta: "7", estado: "pendiente" });
    await app.close();
  });

  it("al cerrarse, una solicitud borra las copias que le queden (las que escribía la marca antes) y la marca sigue", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, titular, hijo, antesJ } = await marcarDesdeElFormulario(app);
    // Una copia del hijo a nombre de la solicitud, como la escribía la marca antes de este cambio.
    await db.insert(fichasPrevias).values({
      solicitud_id: s.id,
      jugador_id: hijo,
      datos: { estado: "precargado", marcado_retiro_en: null, numero_camiseta: antesJ?.numero_camiseta ?? null },
    });
    const r = await app.inject({
      method: "POST",
      url: API.panel.aprobar(s.id),
      cookies,
      payload: { apoderados: [{ id: titular, metodo_pago: "forpay_mensual" }] },
    });
    expect(r.statusCode).toBe(200);
    const [cerrada] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, s.id));
    expect(cerrada?.estado).toBe("revisada");
    expect(await copiasDe(hijo)).toHaveLength(0);
    expect((await estadoJ(hijo))?.marcado_retiro_en).not.toBeNull();
    await app.close();
  });
});

describe("solicitudes: dar por revisada", () => {
  const darPorRevisada = (app: Awaited<ReturnType<typeof appConSesion>>["app"], cookies: Record<string, string>, id: string) =>
    app.inject({ method: "POST", url: API.panel.darPorRevisada(id), cookies });

  it("con una persona o un vínculo por decidir es 409 y no cambia nada", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    const otro = await crearJugador(db, { estado: "precargado" });
    await db
      .insert(fichasPrevias)
      .values({ solicitud_id: s.id, jugador_id: otro, datos: { estado: "precargado", solicitud_id: null } });
    expect((await darPorRevisada(app, cookies, s.id)).statusCode).toBe(409);
    expect(await estadoS(s.id)).toBe("pendiente");
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.solicitud_id, s.id))).toHaveLength(1);

    // Las personas ya decididas, pero el vínculo sigue pendiente: tampoco.
    await db.update(apoderados).set({ estado: "rechazado" }).where(eq(apoderados.id, apo));
    await db.update(jugadores).set({ estado: "rechazado" }).where(eq(jugadores.id, hijo));
    expect((await darPorRevisada(app, cookies, s.id)).statusCode).toBe(409);
    expect(await estadoS(s.id)).toBe("pendiente");
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.solicitud_id, s.id))).toHaveLength(1);
    await app.close();
  });

  it("sin nada por decidir la cierra y borra sus copias; las de otra solicitud no se tocan", async () => {
    const { app, cookies } = await appConSesion(db);
    // Titular ya registrado cuyos cambios bloqueó otra solicitud: no le queda nada que decidir.
    const titular = await crearApoderado(db, {
      estado: "activo",
      foto_id: await fotoPrueba(db),
      metodo_pago: "forpay_mensual",
      credencial_token: generarToken(),
    });
    const s = await nuevaSolicitud({
      titular_apoderado_id: titular,
      avisos: ["titular_ya_registrado", "cambios_bloqueados_por_otra_solicitud"],
    });
    const otra = await nuevaSolicitud();
    const hijo = await crearJugador(db, { estado: "precargado" });
    const ajeno = await crearJugador(db, { estado: "precargado" });
    await db.insert(fichasPrevias).values([
      { solicitud_id: s.id, jugador_id: hijo, datos: { estado: "precargado", solicitud_id: null } },
      { solicitud_id: otra.id, jugador_id: ajeno, datos: { estado: "precargado", solicitud_id: null } },
    ]);

    const r = await darPorRevisada(app, cookies, s.id);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id: s.id, estado: "revisada" });
    expect(r.json().revisada_en).not.toBeNull();
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.solicitud_id, s.id))).toHaveLength(0);
    expect(await db.select().from(fichasPrevias).where(eq(fichasPrevias.solicitud_id, otra.id))).toHaveLength(1);
    expect(await estadoS(otra.id)).toBe("pendiente");

    // Ya revisada: 409.
    expect((await darPorRevisada(app, cookies, s.id)).statusCode).toBe(409);
    await app.close();
  });

  it("una solicitud que no existe es 404", async () => {
    const { app, cookies } = await appConSesion(db);
    expect((await darPorRevisada(app, cookies, "00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
    await app.close();
  });
});

describe("solicitudes: quién aparece en el link de la familia", () => {
  it("el hijo que creó la solicitud sí; un niño que ya existía, nombrado por su vínculo, no", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    const existente = await crearJugadorActivo(db);
    await db
      .insert(jugadorApoderado)
      .values({ jugador_id: existente, apoderado_id: apo, solicitud_id: s.id, paga_mensualidad: false });
    const r = await app.inject({ method: "GET", url: API.panel.solicitud(s.id), cookies });
    expect(r.statusCode).toBe(200);
    const enLink = Object.fromEntries(
      r.json().jugadores.map((j: { id: string; en_link_familia: boolean }) => [j.id, j.en_link_familia]),
    );
    expect(enLink).toEqual({ [hijo]: true, [existente]: false });
    await app.close();
  });

  it("titular precargado (no registrado): el precargado de su lista que completó sí aparece", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s } = await familia({ avisos: [] });
    const precargado = await crearJugador(db, { estado: "pendiente", solicitud_id: s.id });
    const r = await app.inject({ method: "GET", url: API.panel.solicitud(s.id), cookies });
    const enLink = Object.fromEntries(
      r.json().jugadores.map((j: { id: string; en_link_familia: boolean }) => [j.id, j.en_link_familia]),
    );
    expect(enLink[precargado]).toBe(true);
    await app.close();
  });

  it("en una solicitud de segundo apoderado nadie está en un link de familia", async () => {
    const { app, cookies } = await appConSesion(db);
    const origen = await nuevaSolicitud();
    const s = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: origen.id });
    const apo = await crearApoderado(db, { estado: "pendiente", origen: "formulario", solicitud_id: s.id });
    const hijo = await crearJugador(db, { estado: "pendiente", origen: "formulario", solicitud_id: s.id });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: apo, solicitud_id: s.id, paga_mensualidad: false });
    const r = await app.inject({ method: "GET", url: API.panel.solicitud(s.id), cookies });
    expect(r.statusCode).toBe(200);
    expect(r.json().jugadores.map((j: { en_link_familia: boolean }) => j.en_link_familia)).toEqual([false]);
    await app.close();
  });

  it("con titular ya registrado, ni el precargado de su lista que la solicitud completó", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, hijo } = await familia({ avisos: ["titular_ya_registrado"] });
    const precargado = await crearJugador(db, { estado: "pendiente", solicitud_id: s.id });
    const r = await app.inject({ method: "GET", url: API.panel.solicitud(s.id), cookies });
    const enLink = Object.fromEntries(
      r.json().jugadores.map((j: { id: string; en_link_familia: boolean }) => [j.id, j.en_link_familia]),
    );
    expect(enLink[hijo]).toBe(true);
    expect(enLink[precargado]).toBe(false);
    await app.close();
  });
});
