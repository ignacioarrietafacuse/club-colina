import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { apoderados, categorias, jugadorApoderado, jugadores, solicitudesRegistro } from "../../db/schema";
import { generarToken, hashToken } from "../../lib/tokens";
import { dbTest } from "../../test/db";
import { appConSesion, crearApoderado, crearJugador, crearJugadorActivo, fotoPrueba } from "./prueba.test-utils";

const { db, cerrar } = dbTest();
afterAll(cerrar);

async function nuevaSolicitud(extra: Partial<typeof solicitudesRegistro.$inferInsert> = {}) {
  const [s] = await db
    .insert(solicitudesRegistro)
    .values({ token_acceso_hash: hashToken(generarToken()), consentimiento_en: new Date(), ...extra })
    .returning();
  if (!s) throw new Error("sin solicitud");
  return s;
}

/**
 * Una familia como la deja S2: apoderado nuevo con su hijo nuevo (los dos con `solicitud_id`),
 * el vínculo entre ellos, y un hijo de otra familia nombrado por RUT, que entra solo por su
 * vínculo pendiente.
 */
async function familia() {
  const s = await nuevaSolicitud({ avisos: ["hijo_con_otro_apoderado"], coincide_base: true });
  const apellido = `Fam${Date.now()}`;
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
  const ajeno = await crearJugadorActivo(db, { nombre: "Ajeno", apellido: "Otro" });
  await db.insert(jugadorApoderado).values([
    { jugador_id: hijo, apoderado_id: apo, solicitud_id: s.id, paga_mensualidad: true },
    { jugador_id: ajeno, apoderado_id: apo, solicitud_id: s.id },
  ]);
  return { s, apo, hijo, ajeno, apellido };
}

async function u14(): Promise<number> {
  const [c] = await db
    .select()
    .from(categorias)
    .where(and(eq(categorias.nombre, "U14"), eq(categorias.disciplina, "voleibol")));
  if (!c) throw new Error("sin U14");
  return c.id;
}

const becas = { beca_mensualidad_pct: 25, beca_torneos_pct: 0, beca_campus_pct: 100 };

describe("solicitudes en el panel", () => {
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

  it("listado con titular, avisos y personas pendientes; detalle con las personas y vínculos", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo, ajeno, apellido } = await familia();
    const lista = (await app.inject({ method: "GET", url: "/api/panel/solicitudes?estado=pendiente", cookies })).json();
    const resumen = lista.find((x: { id: string }) => x.id === s.id);
    expect(resumen).toMatchObject({
      tipo: "formulario",
      coincide_base: true,
      avisos: ["hijo_con_otro_apoderado"],
      titular: { nombre_completo: `Marta ${apellido}`, rol: "apoderado" },
      personas_pendientes: 2,
    });
    const revisadas = (await app.inject({ method: "GET", url: "/api/panel/solicitudes?estado=revisada", cookies })).json();
    expect(revisadas.some((x: { id: string }) => x.id === s.id)).toBe(false);

    const r = await app.inject({ method: "GET", url: `/api/panel/solicitudes/${s.id}`, cookies });
    expect(r.statusCode).toBe(200);
    const d = r.json();
    expect(d.jugadores.map((j: { id: string }) => j.id).sort()).toEqual([hijo, ajeno].sort());
    expect(d.apoderados.map((a: { id: string }) => a.id)).toEqual([apo]);
    expect(d.vinculos).toHaveLength(2);
    expect(JSON.stringify(d)).not.toContain(s.token_acceso_hash);
    expect((await app.inject({ method: "GET", url: "/api/panel/solicitudes/00000000-0000-4000-8000-000000000000", cookies })).statusCode).toBe(404);
    await app.close();
  });

  it("titular: apoderado ya registrado que vuelve, sin confundirlo con el otro apoderado que agregó", async () => {
    const { app, cookies } = await appConSesion(db);
    const s = await nuevaSolicitud();
    const viejo = await crearApoderado(db, { nombre: "Ya", apellido: "Registrado", estado: "activo", foto_id: await fotoPrueba(db), credencial_token: generarToken() });
    const segunda = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: s.id, consentimiento_en: null });
    const otro = await crearApoderado(db, { nombre: "Otro", apellido: "Apoderado", estado: "pendiente", origen: "formulario", solicitud_id: segunda.id });
    const hijo = await crearJugador(db, { estado: "pendiente", origen: "formulario", solicitud_id: s.id });
    // El otro apoderado se vincula primero, para que el orden no decida.
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: otro, solicitud_id: s.id });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: viejo, solicitud_id: s.id });
    const lista = (await app.inject({ method: "GET", url: "/api/panel/solicitudes", cookies })).json();
    expect(lista.find((x: { id: string }) => x.id === s.id).titular).toEqual({ nombre_completo: "Ya Registrado", rol: "apoderado" });
    expect(lista.find((x: { id: string }) => x.id === segunda.id).titular).toEqual({ nombre_completo: "Otro Apoderado", rol: "apoderado" });
    await app.close();
  });

  it("aprobación parcial y después total: credenciales, becas y la solicitud pasa a revisada", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo, ajeno } = await familia();
    const aprobar = (payload: object) =>
      app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/aprobar`, cookies, payload });

    let r = await aprobar({
      jugadores: [{ id: hijo, categoria_id: await u14(), numero_camiseta: "00", ...becas }],
      apoderados: [{ id: apo, metodo_pago: "forpay_mensual" }],
      vinculos: [{ jugador_id: hijo, apoderado_id: apo }],
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().estado).toBe("pendiente"); // falta el vínculo con el hijo ajeno
    const [j] = await db.select().from(jugadores).where(eq(jugadores.id, hijo));
    expect(j).toMatchObject({ estado: "activo", numero_camiseta: "00", beca_campus_pct: 100 });
    expect(j?.credencial_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [a] = await db.select().from(apoderados).where(eq(apoderados.id, apo));
    expect(a).toMatchObject({ estado: "activo", metodo_pago: "forpay_mensual" });

    r = await aprobar({ vinculos: [{ jugador_id: ajeno, apoderado_id: apo }] });
    expect(r.json().estado).toBe("revisada");
    expect(r.json().revisada_en).not.toBeNull();
    expect(r.json().vinculos.every((v: { estado: string }) => v.estado === "activo")).toBe(true);

    // Aprobar de nuevo a alguien ya activo: 409.
    r = await aprobar({ apoderados: [{ id: apo }] });
    expect(r.statusCode).toBe(409);
    await app.close();
  });

  it("si falta algo no se aprueba nada (422) y la transacción se deshace", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    await db.update(jugadores).set({ foto_id: null }).where(eq(jugadores.id, hijo));
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: {
        apoderados: [{ id: apo }],
        jugadores: [{ id: hijo, categoria_id: null, numero_camiseta: "99", ...becas }],
      },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toEqual({ codigo: "requisitos_incompletos", mensaje: "Faltan datos: foto" });
    const [a] = await db.select().from(apoderados).where(eq(apoderados.id, apo));
    expect(a?.estado).toBe("pendiente");
    expect(a?.credencial_token).toBeNull();
    await app.close();
  });

  it("no aprueba personas ni vínculos de otra solicitud, ni categorías de otra rama", async () => {
    const { app, cookies } = await appConSesion(db);
    const uno = await familia();
    const dos = await familia();
    const aprobar = (payload: object) =>
      app.inject({ method: "POST", url: `/api/panel/solicitudes/${uno.s.id}/aprobar`, cookies, payload });
    expect((await aprobar({ apoderados: [{ id: dos.apo }] })).statusCode).toBe(409);
    expect((await aprobar({ vinculos: [{ jugador_id: dos.hijo, apoderado_id: dos.apo }] })).statusCode).toBe(409);
    const [basket] = await db.select().from(categorias).where(eq(categorias.disciplina, "basketball")).limit(1);
    const r = await aprobar({ jugadores: [{ id: uno.hijo, categoria_id: basket?.id, numero_camiseta: "5", ...becas }] });
    expect(r.statusCode).toBe(400);
    const [a] = await db.select().from(apoderados).where(eq(apoderados.id, dos.apo));
    expect(a?.estado).toBe("pendiente");
    await app.close();
  });

  it("rechazo parcial borra los vínculos pendientes de esa persona; el total cierra la solicitud", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo, ajeno } = await familia();
    const rechazar = (payload: object) =>
      app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload });

    let r = await rechazar({ personas: [{ rol: "jugador", id: hijo }] });
    expect(r.statusCode).toBe(200);
    const [j] = await db.select().from(jugadores).where(eq(jugadores.id, hijo));
    expect(j?.estado).toBe("rechazado");
    expect(
      await db.select().from(jugadorApoderado).where(and(eq(jugadorApoderado.jugador_id, hijo), eq(jugadorApoderado.apoderado_id, apo))),
    ).toHaveLength(0);
    expect(r.json().estado).toBe("pendiente");

    // Una persona que no es de la solicitud, o que ya no está pendiente: 409.
    expect((await rechazar({ personas: [{ rol: "jugador", id: ajeno }] })).statusCode).toBe(409);

    r = await rechazar({});
    expect(r.json().estado).toBe("revisada");
    const [a] = await db.select().from(apoderados).where(eq(apoderados.id, apo));
    expect(a).toMatchObject({ estado: "rechazado", credencial_token: null });
    // El hijo ajeno sigue activo y sin el vínculo que pedía la solicitud.
    const [aj] = await db.select().from(jugadores).where(eq(jugadores.id, ajeno));
    expect(aj?.estado).toBe("activo");
    expect(await db.select().from(jugadorApoderado).where(eq(jugadorApoderado.solicitud_id, s.id))).toHaveLength(0);
    await app.close();
  });

  it("link nuevo: anula el anterior, apunta a /familia o /completar y no se guarda en caché", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s } = await familia();
    const r = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/link`, cookies });
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    const { url } = r.json();
    const m = /^https:\/\/panel\.ejemplo\.test\/familia\/([A-Za-z0-9_-]{43})$/.exec(url);
    expect(m).not.toBeNull();
    const [fila] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, s.id));
    expect(fila?.token_acceso_hash).toBe(hashToken(m?.[1] ?? ""));
    expect(fila?.token_acceso_hash).not.toBe(s.token_acceso_hash);

    const segunda = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: s.id, consentimiento_en: null });
    const r2 = await app.inject({ method: "POST", url: `/api/panel/solicitudes/${segunda.id}/link`, cookies });
    expect(r2.json().url).toMatch(/^https:\/\/panel\.ejemplo\.test\/completar\/[A-Za-z0-9_-]{43}$/);
    await app.close();
  });

  it("no aprueba un vínculo hacia un jugador inactivo o rechazado que ya existía, con un mensaje claro", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, ajeno } = await familia();
    await db.update(jugadores).set({ estado: "inactivo", credencial_token: null }).where(eq(jugadores.id, ajeno));
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: { vinculos: [{ jugador_id: ajeno, apoderado_id: apo }] },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toEqual({
      codigo: "conflicto",
      mensaje: "El jugador de ese vínculo está inactivo: reactívalo en su ficha antes de aprobar el vínculo",
    });
    const [v] = await db
      .select()
      .from(jugadorApoderado)
      .where(and(eq(jugadorApoderado.jugador_id, ajeno), eq(jugadorApoderado.apoderado_id, apo)));
    expect(v?.estado).toBe("pendiente");
    await app.close();
  });

  it("el detalle muestra al hijo marcado 'ya no está' de esa familia, y no se aprueba por la solicitud", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo } = await familia();
    // Un hijo precargado de la familia, marcado por el formulario (S2): sin solicitud_id ni vínculo nuevo.
    const marcado = await crearJugador(db, { nombre: "Ida", marcado_retiro_en: new Date() });
    await db.insert(jugadorApoderado).values({ jugador_id: marcado, apoderado_id: apo, estado: "activo" });
    // Otro marcado que Mony ya dio de baja no aparece.
    const deBaja = await crearJugador(db, { marcado_retiro_en: new Date(), estado: "inactivo" });
    await db.insert(jugadorApoderado).values({ jugador_id: deBaja, apoderado_id: apo, estado: "activo" });

    const d = (await app.inject({ method: "GET", url: `/api/panel/solicitudes/${s.id}`, cookies })).json();
    const ids = d.jugadores.map((j: { id: string }) => j.id);
    expect(ids).toContain(marcado);
    expect(ids).not.toContain(deBaja);
    const ficha = d.jugadores.find((j: { id: string }) => j.id === marcado);
    expect(ficha.marcado_retiro_en).not.toBeNull();
    expect(ficha.estado).toBe("precargado");

    // No es parte de lo que se aprueba ni de lo que se rechaza.
    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: { jugadores: [{ id: marcado, categoria_id: null, numero_camiseta: "1", beca_mensualidad_pct: 0, beca_torneos_pct: 0, beca_campus_pct: 0 }] },
    });
    expect(r.statusCode).toBe(409);
    await app.inject({ method: "POST", url: `/api/panel/solicitudes/${s.id}/rechazar`, cookies, payload: {} });
    const [sigue] = await db.select().from(jugadores).where(eq(jugadores.id, marcado));
    expect(sigue?.estado).toBe("precargado");
    await app.close();
  });

  it("el segundo apoderado se decide desde la solicitud que lo agregó y su propia solicitud se cierra", async () => {
    const { app, cookies } = await appConSesion(db);
    const { s, apo, hijo } = await familia();
    // Como lo deja S2: fila propia del segundo apoderado, y su vínculo con la solicitud de origen.
    const segunda = await nuevaSolicitud({ tipo: "segundo_apoderado", solicitud_origen_id: s.id, consentimiento_en: new Date() });
    const otro = await crearApoderado(db, {
      estado: "pendiente",
      origen: "formulario",
      solicitud_id: segunda.id,
      foto_id: await fotoPrueba(db),
    });
    await db.insert(jugadorApoderado).values({ jugador_id: hijo, apoderado_id: otro, solicitud_id: s.id });

    const d = (await app.inject({ method: "GET", url: `/api/panel/solicitudes/${s.id}`, cookies })).json();
    expect(d.apoderados.map((a: { id: string }) => a.id).sort()).toEqual([apo, otro].sort());

    const r = await app.inject({
      method: "POST",
      url: `/api/panel/solicitudes/${s.id}/aprobar`,
      cookies,
      payload: { apoderados: [{ id: otro }], vinculos: [{ jugador_id: hijo, apoderado_id: otro }] },
    });
    expect(r.statusCode).toBe(200);
    const [fila] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.id, segunda.id));
    expect(fila?.estado).toBe("revisada");
    await app.close();
  });
});
