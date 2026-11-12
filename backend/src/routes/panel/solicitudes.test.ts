import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import {
  apoderados,
  categorias,
  fichasPrevias,
  fotos,
  jugadorApoderado,
  jugadores,
  solicitudesRegistro,
} from "../../db/schema";
import { generarToken, hashToken } from "../../lib/tokens";
import { dbTest } from "../../test/db";
import { appConSesion, crearApoderado, crearJugador, crearJugadorActivo, fotoPrueba } from "./prueba.test-utils";

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

  it("un jugador marcado 'ya no está' no se aprueba ni se activa hasta que Mony quita la marca", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, hijo } = await familia();
    await db.update(jugadores).set({ marcado_retiro_en: new Date() }).where(eq(jugadores.id, hijo));
    const aprobar = () =>
      app.inject({
        method: "POST",
        url: `/api/panel/solicitudes/${s.id}/aprobar`,
        cookies,
        payload: { jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "7", ...becas }] },
      });
    let r = await aprobar();
    expect(r.statusCode).toBe(409);
    expect(r.json().error.mensaje).toContain("quita la marca");

    const precargado = await crearJugador(db, { numero_camiseta: "3", foto_id: await fotoPrueba(db), marcado_retiro_en: new Date() });
    expect((await app.inject({ method: "POST", url: `/api/panel/jugadores/${precargado}/activar`, cookies })).statusCode).toBe(409);

    r = await app.inject({ method: "DELETE", url: `/api/panel/jugadores/${hijo}/marca-retiro`, cookies });
    expect(r.statusCode).toBe(200);
    expect(r.json().marcado_retiro_en).toBeNull();
    expect((await aprobar()).statusCode).toBe(200);
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
    expect(await estadoA(otra.apo)).toMatchObject({ estado: "rechazado", credencial_token: null });
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
    const fotoA = await fotoPrueba(db);
    const fotoJ = await fotoPrueba(db);
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

  it("una persona nueva rechazada queda rechazada y sin credencial", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, hijo } = await familia();
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/rechazar`,
      cookies,
      payload: { personas: [{ rol: "jugador", id: hijo }] },
    });
    expect(r.statusCode).toBe(200);
    expect(await estadoJ(hijo)).toMatchObject({ estado: "rechazado", credencial_token: null });
    expect(r.json().estado).toBe("pendiente");
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
