import { API, FOTO_MAX_BYTES, generarRutFicticio, type SolicitudDatos } from "@club-colina/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { construirApp } from "../../app";
import { apoderados, categorias, fichasPrevias, jugadorApoderado, jugadores, solicitudesRegistro } from "../../db/schema";
import { guardarFoto } from "../../lib/fotos";
import { LIMITES } from "../../lib/limite-intentos";
import { hashToken } from "../../lib/tokens";
import { crearApoderado, crearJugador, rutNuevo, vaciarRegistro, vincular } from "../../services/registro/datos-prueba";
import { configTest, dbTest, JPEG_PRUEBA, PNG_PRUEBA, urlTest } from "../../test/db";
import { crearDb } from "../../db/cliente";

const { db, cerrar } = dbTest();
afterAll(cerrar);
beforeEach(() => vaciarRegistro(db));

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

function multipart(datos: unknown, fotos: Record<string, Buffer> = {}): FormData {
  const form = new FormData();
  form.append("datos", typeof datos === "string" ? datos : JSON.stringify(datos));
  for (const [clave, bytes] of Object.entries(fotos)) {
    form.append(`foto_${clave}`, new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), `${clave}.jpg`);
  }
  return form;
}

async function enviar(app: FastifyInstance, datos: unknown, fotos: Record<string, Buffer> = {}, ip = "198.51.100.9") {
  return app.inject({
    method: "POST",
    url: API.public.solicitudes,
    payload: multipart(datos, fotos),
    headers: { "x-real-ip": ip },
  });
}

async function solicitudes() {
  return db.select().from(solicitudesRegistro).orderBy(solicitudesRegistro.creada_en);
}

async function contar(tabla: "fotos" | "solicitudes_registro" | "jugadores" | "apoderados") {
  const [f] = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(tabla)}`);
  return f?.n ?? -1;
}

async function jugadorRut(rut: string) {
  const [fila] = await db.select().from(jugadores).where(eq(jugadores.rut, rut));
  if (!fila) throw new Error("no está");
  return fila;
}

async function apoderadoRut(rut: string) {
  const [fila] = await db.select().from(apoderados).where(eq(apoderados.rut, rut));
  if (!fila) throw new Error("no está");
  return fila;
}

const hijoNuevo = (rut: string, foto = "h0") => ({
  ref: { rut },
  nombre: "Agustina",
  apellido: "Inventada",
  fecha_nacimiento: "2014-04-04",
  disciplina: "basketball" as const,
  numero_camiseta: "00",
  foto,
});

const apoderadoNuevo = (rut: string): SolicitudDatos => ({
  rut,
  tipo: "apoderado",
  consentimiento: true,
  nombre: "Carla",
  apellido: "Ficticia",
  telefono: "+56 9 1234 5678",
  foto: "titular",
  paga_mensualidad: true,
});

const adultoCompleto = (rut: string): SolicitudDatos => ({
  rut,
  tipo: "jugador_adulto",
  consentimiento: true,
  nombre: "Valentina",
  apellido: "Prueba",
  telefono: "977777777",
  fecha_nacimiento: "2000-02-02",
  disciplina: "voleibol",
  numero_camiseta: "12",
  foto: "t",
});

describe("POST /api/public/solicitudes", () => {
  it("apoderado e hijo nuevos: quedan pendientes, con su foto y un link que la base guarda como hash", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rut = rutNuevo();
    const rutHijo = rutNuevo();
    const r = await enviar(
      app,
      { ...apoderadoNuevo(rut), hijos: [hijoNuevo(rutHijo)] },
      { titular: JPEG_PRUEBA, h0: PNG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    expect(r.headers["cache-control"]).toBe("no-store");
    const cuerpo = r.json();
    expect(Object.keys(cuerpo).sort()).toEqual(["otros_apoderados", "token_acceso"]);
    expect(cuerpo.token_acceso).toMatch(TOKEN);
    expect(cuerpo.otros_apoderados).toEqual([]);

    const [s] = await solicitudes();
    expect(s).toMatchObject({ tipo: "formulario", estado: "pendiente", coincide_base: false, avisos: [] });
    expect(s?.token_acceso_hash).toBe(hashToken(cuerpo.token_acceso));
    expect(s?.consentimiento_en).toBeInstanceOf(Date);

    const a = await apoderadoRut(rut);
    expect(a).toMatchObject({ estado: "pendiente", origen: "formulario", solicitud_id: s?.id, telefono: "912345678" });
    expect(a.foto_id).not.toBeNull();
    const j = await jugadorRut(rutHijo);
    expect(j).toMatchObject({ estado: "pendiente", solicitud_id: s?.id, numero_camiseta: "00", credencial_token: null });
    const [u13] = await db.select().from(categorias).where(eq(categorias.nombre, "U13"));
    expect(j.categoria_id).toBe(u13?.id);
    const [v] = await db.select().from(jugadorApoderado).where(eq(jugadorApoderado.jugador_id, j.id));
    expect(v).toMatchObject({ apoderado_id: a.id, estado: "pendiente", paga_mensualidad: true, solicitud_id: s?.id });
    expect(await contar("fotos")).toBe(2);
    await app.close();
  });

  it("apoderado precargado: completa solo lo que falta, no pisa la base y avisa si el teléfono difiere", async () => {
    const titular = await crearApoderado(db, { nombre: null, telefono: "911111111" });
    const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: null });
    await vincular(db, hijo.id, titular.id, { paga_mensualidad: false });
    const app = await construirApp({ config: configTest(), db });
    const r = await enviar(
      app,
      {
        rut: titular.rut,
        tipo: "apoderado",
        consentimiento: true,
        nombre: "Rosa",
        apellido: "Distinta",
        telefono: "922222222",
        foto: "titular",
        paga_mensualidad: true,
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, numero_camiseta: "7", nombre: "Otro", foto: "h0" }],
      },
      { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    const [s] = await solicitudes();
    expect(s?.coincide_base).toBe(true);
    expect(s?.avisos).toEqual(["telefono_distinto_base"]);
    const a = await apoderadoRut(titular.rut);
    expect(a).toMatchObject({ nombre: "Rosa", apellido: "Ficticia", telefono: "911111111", estado: "pendiente", solicitud_id: s?.id });
    const j = await jugadorRut(hijo.rut);
    expect(j).toMatchObject({ nombre: "Tomás", numero_camiseta: "7", estado: "pendiente", solicitud_id: s?.id });
    expect(j.foto_id).not.toBeNull();
    const [v] = await db.select().from(jugadorApoderado).where(eq(jugadorApoderado.jugador_id, hijo.id));
    expect(v?.paga_mensualidad).toBe(true);
    await app.close();
  });

  it("precargado sin teléfono en la base: se le pide y se avisa que no hubo con qué comparar", async () => {
    const titular = await crearApoderado(db, { telefono: null });
    const app = await construirApp({ config: configTest(), db });
    const sinTel = await enviar(app, { rut: titular.rut, tipo: "apoderado", consentimiento: true, foto: "t" }, { t: JPEG_PRUEBA });
    expect(sinTel.statusCode).toBe(400);
    expect(sinTel.json().error.mensaje).toContain("telefono");
    const r = await enviar(
      app,
      { rut: titular.rut, tipo: "apoderado", consentimiento: true, foto: "t", telefono: "933333333" },
      { t: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    expect((await solicitudes())[0]?.avisos).toEqual(["sin_telefono_en_base"]);
    await app.close();
  });

  it("si la posición no existe o el nombre ya no coincide: 409 y no queda nada escrito", async () => {
    const titular = await crearApoderado(db);
    const hijo = await crearJugador(db, { nombre: "Tomás" });
    await vincular(db, hijo.id, titular.id);
    const app = await construirApp({ config: configTest(), db });
    for (const ref of [
      { precargado: 1, primer_nombre: "Tomás" },
      { precargado: 0, primer_nombre: "Camila" },
    ]) {
      const r = await enviar(
        app,
        { rut: titular.rut, tipo: "apoderado", consentimiento: true, foto: "t", hijos: [{ ref, foto: "h", numero_camiseta: "1" }] },
        { t: JPEG_PRUEBA, h: JPEG_PRUEBA },
      );
      expect(r.statusCode).toBe(409);
      expect(r.json().error.codigo).toBe("conflicto");
    }
    expect(await contar("solicitudes_registro")).toBe(0);
    expect(await contar("fotos")).toBe(0);
    expect((await apoderadoRut(titular.rut)).estado).toBe("precargado");
    await app.close();
  });

  it("lo que falta se nombra por campo, sin valores, y nada queda a medias", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rutHijo = rutNuevo();
    const sinFoto = { ...hijoNuevo(rutHijo), foto: undefined };
    const r = await enviar(app, { ...apoderadoNuevo(rutNuevo()), hijos: [sinFoto] }, { titular: JPEG_PRUEBA });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toEqual({ codigo: "validacion", mensaje: "Datos inválidos: hijos.0.foto" });
    expect(await contar("solicitudes_registro")).toBe(0);
    expect(await contar("apoderados")).toBe(0);
    expect(await contar("fotos")).toBe(0);
    await app.close();
  });

  it("si la categoría no se puede calcular y no la eligió, queda vacía para Mony", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rutHijo = rutNuevo();
    const r = await enviar(
      app,
      { ...apoderadoNuevo(rutNuevo()), hijos: [{ ...hijoNuevo(rutHijo), disciplina: "voleibol", fecha_nacimiento: "2017-01-01" }] },
      { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    expect((await jugadorRut(rutHijo)).categoria_id).toBeNull();
    await app.close();
  });

  it("la categoría elegida tiene que ser de la misma rama; si se puede calcular, manda la calculada", async () => {
    const [u12] = await db.select().from(categorias).where(eq(categorias.nombre, "U12"));
    const [u16] = await db.select().from(categorias).where(eq(categorias.nombre, "U16"));
    const [u9] = await db.select().from(categorias).where(eq(categorias.nombre, "U9"));
    const app = await construirApp({ config: configTest(), db });
    const malo = await enviar(
      app,
      { ...apoderadoNuevo(rutNuevo()), hijos: [{ ...hijoNuevo(rutNuevo()), disciplina: "voleibol", fecha_nacimiento: "2017-01-01", categoria_id: u9?.id }] },
      { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA },
    );
    expect(malo.statusCode).toBe(400);
    expect(malo.json().error.mensaje).toContain("hijos.0.categoria_id");
    const rutHijo = rutNuevo();
    const r = await enviar(
      app,
      { ...apoderadoNuevo(rutNuevo()), hijos: [{ ...hijoNuevo(rutHijo), disciplina: "voleibol", fecha_nacimiento: "2015-01-01", categoria_id: u16?.id }] },
      { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    expect((await jugadorRut(rutHijo)).categoria_id).toBe(u12?.id);
    await app.close();
  });

  it("'ya no está': lo marca para Mony, sin asignarle la solicitud; solo para hijos propios", async () => {
    const titular = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    const hijo = await crearJugador(db, { nombre: "Tomás" });
    await vincular(db, hijo.id, titular.id);
    const ajeno = await crearJugador(db);
    const app = await construirApp({ config: configTest(), db });
    const base = { rut: titular.rut, tipo: "apoderado" as const, consentimiento: true as const };
    const otro = await enviar(app, { ...base, hijos: [{ ref: { rut: ajeno.rut }, ya_no_esta: true }] });
    expect(otro.statusCode).toBe(400);
    expect(otro.json().error.mensaje).toContain("hijos.0.ya_no_esta");
    const r = await enviar(app, { ...base, hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, ya_no_esta: true }] });
    expect(r.statusCode).toBe(201);
    const j = await jugadorRut(hijo.rut);
    expect(j.marcado_retiro_en).toBeInstanceOf(Date);
    expect(j).toMatchObject({ solicitud_id: null, estado: "precargado" });
    expect((await solicitudes())[0]?.avisos).toEqual(["hijo_marcado_ya_no_esta"]);
    await app.close();
  });

  it("un hijo de otra familia nombrado por RUT: solo un vínculo pendiente, sin tocar su ficha ni asignarle la solicitud", async () => {
    const otraMadre = await crearApoderado(db);
    const ajeno = await crearJugador(db, {
      nombre: "Florencia",
      estado: "activo",
      numero_camiseta: "5",
      foto_id: await guardarFoto(db, JPEG_PRUEBA),
      credencial_token: "a".repeat(43),
    });
    await vincular(db, ajeno.id, otraMadre.id);
    const app = await construirApp({ config: configTest(), db });
    const rut = rutNuevo();
    const r = await enviar(
      app,
      { ...apoderadoNuevo(rut), hijos: [{ ...hijoNuevo(ajeno.rut), nombre: "Cambiado" }] },
      { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    expect(r.body).not.toContain("Florencia");
    expect(r.body).not.toContain("a".repeat(43));
    const [s] = await solicitudes();
    expect(s?.avisos.sort()).toEqual(["apoderado_nuevo_para_hijo_registrado", "hijo_con_otro_apoderado"]);
    const j = await jugadorRut(ajeno.rut);
    expect(j).toMatchObject({ nombre: "Florencia", numero_camiseta: "5", solicitud_id: null, estado: "activo" });
    const a = await apoderadoRut(rut);
    const vinculos = await db.select().from(jugadorApoderado).where(eq(jugadorApoderado.apoderado_id, a.id));
    expect(vinculos).toEqual([expect.objectContaining({ jugador_id: ajeno.id, estado: "pendiente", solicitud_id: s?.id })]);
    // Tampoco aparece en la consulta de RUT de quien lo nombró.
    const consulta = await app.inject({ method: "POST", url: API.public.rutLookup, payload: { rut } });
    expect(consulta.json().hijos).toEqual([]);
    await app.close();
  });

  it("un hijo nombrado por RUT exige todos sus datos, exista o no: la respuesta no revela si el RUT está", async () => {
    const existente = await crearJugador(db);
    const app = await construirApp({ config: configTest(), db });
    const respuestas = [];
    for (const rut of [existente.rut, rutNuevo()]) {
      const r = await enviar(
        app,
        { ...apoderadoNuevo(rutNuevo()), hijos: [{ ref: { rut }, numero_camiseta: "4" }] },
        { titular: JPEG_PRUEBA },
      );
      respuestas.push([r.statusCode, r.body]);
    }
    expect(respuestas[0]).toEqual(respuestas[1]);
    expect(respuestas[0]?.[0]).toBe(400);
    expect(await contar("solicitudes_registro")).toBe(0);
    await app.close();
  });

  it("un hijo precargado sin apoderado, nombrado por RUT: se completa lo que falta, sin asignarle la solicitud", async () => {
    const huerfano = await crearJugador(db, { numero_camiseta: null });
    const app = await construirApp({ config: configTest(), db });
    const rutTitular = rutNuevo();
    const r = await enviar(
      app,
      { ...apoderadoNuevo(rutTitular), hijos: [{ ...hijoNuevo(huerfano.rut), nombre: "Cambiado", numero_camiseta: "9" }] },
      { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    const j = await jugadorRut(huerfano.rut);
    expect(j).toMatchObject({ nombre: "Tomás Andrés", numero_camiseta: "9", estado: "pendiente", solicitud_id: null });
    expect(j.foto_id).not.toBeNull();
    // Mony confirma que el hijo es de esta familia: nadie más lo tenía en la base.
    expect((await solicitudes())[0]?.avisos).toEqual(["hijo_precargado_completado_por_rut"]);
    // Quien lo nombró no ve su nombre en la consulta de RUT hasta que Mony aprueba el vínculo.
    const consulta = await app.inject({ method: "POST", url: API.public.rutLookup, payload: { rut: rutTitular } });
    expect(consulta.json().hijos).toEqual([]);
    await app.close();
  });

  it("apoderado ya registrado: no se piden ni cambian sus datos, agrega hijos y marca la solicitud anterior pendiente", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rut = rutNuevo();
    const primera = await enviar(app, apoderadoNuevo(rut), { titular: JPEG_PRUEBA });
    expect(primera.statusCode).toBe(201);

    const nada = await enviar(app, { rut, tipo: "apoderado", consentimiento: true });
    expect(nada.statusCode).toBe(400);

    const rutHijo = rutNuevo();
    const r = await enviar(
      app,
      { rut, tipo: "apoderado", consentimiento: true, nombre: "Suplantadora", telefono: "999999999", hijos: [hijoNuevo(rutHijo)] },
      { h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    const [anterior, nueva] = await solicitudes();
    expect(anterior?.avisos).toEqual(["hay_solicitud_posterior"]);
    expect(nueva?.avisos).toEqual(["titular_ya_registrado"]);
    const a = await apoderadoRut(rut);
    expect(a).toMatchObject({ nombre: "Carla", telefono: "912345678", solicitud_id: anterior?.id });
    expect((await jugadorRut(rutHijo)).solicitud_id).toBe(nueva?.id);
    await app.close();
  });

  it("otro apoderado nuevo: su propia solicitud con un link /completar que la base guarda como hash", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rutHijo = rutNuevo();
    const rutOtro = rutNuevo();
    const r = await enviar(
      app,
      {
        ...apoderadoNuevo(rutNuevo()),
        hijos: [hijoNuevo(rutHijo)],
        otro_apoderado: { nombre: "Diego", apellido: "Inventado", rut: rutOtro, telefono: "944444444", hijos: [0] },
      },
      { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    const { otros_apoderados } = r.json();
    expect(otros_apoderados).toHaveLength(1);
    expect(otros_apoderados[0].nombre_completo).toBe("Diego Inventado");
    expect(otros_apoderados[0].completar_token).toMatch(TOKEN);
    expect(Object.keys(otros_apoderados[0]).sort()).toEqual(["completar_token", "nombre_completo"]);

    const lista = await solicitudes();
    const s = lista.find((x) => x.tipo === "formulario");
    const s2 = lista.find((x) => x.tipo === "segundo_apoderado");
    expect(s2).toMatchObject({
      tipo: "segundo_apoderado",
      solicitud_origen_id: s?.id,
      consentimiento_en: null,
      token_acceso_hash: hashToken(otros_apoderados[0].completar_token),
    });
    const otro = await apoderadoRut(rutOtro);
    expect(otro).toMatchObject({ estado: "pendiente", foto_id: null, solicitud_id: s2?.id });
    const j = await jugadorRut(rutHijo);
    const [v] = await db.select().from(jugadorApoderado).where(eq(jugadorApoderado.apoderado_id, otro.id));
    expect(v).toMatchObject({ jugador_id: j.id, estado: "pendiente", paga_mensualidad: false, solicitud_id: s?.id });
    await app.close();
  });

  it("otro apoderado que ya estaba registrado: aviso y vínculo, sin link nuevo", async () => {
    const yaEsta = await crearApoderado(db, { estado: "pendiente" });
    const app = await construirApp({ config: configTest(), db });
    const r = await enviar(
      app,
      {
        ...apoderadoNuevo(rutNuevo()),
        hijos: [hijoNuevo(rutNuevo())],
        otro_apoderado: { nombre: "X", apellido: "Y", rut: yaEsta.rut, telefono: "955555555", hijos: [0] },
      },
      { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    expect(r.json().otros_apoderados).toEqual([]);
    const lista = await solicitudes();
    expect(lista).toHaveLength(1);
    expect(lista[0]?.avisos).toEqual(["otro_apoderado_ya_registrado"]);
    expect(await apoderadoRut(yaEsta.rut)).toMatchObject({ nombre: "Rosa", telefono: "911111111" });
    await app.close();
  });

  it("jugador adulto nuevo: se registra solo; un menor no puede", async () => {
    const app = await construirApp({ config: configTest(), db });
    const datos = {
      rut: rutNuevo(),
      tipo: "jugador_adulto" as const,
      consentimiento: true as const,
      nombre: "Valentina",
      apellido: "Prueba",
      telefono: "966666666",
      fecha_nacimiento: "2000-02-02",
      disciplina: "voleibol" as const,
      numero_camiseta: "99",
      foto: "t",
    };
    const menor = await enviar(app, { ...datos, fecha_nacimiento: "2012-01-01" }, { t: JPEG_PRUEBA });
    expect(menor.statusCode).toBe(400);
    expect(menor.json().error.mensaje).toContain("fecha_nacimiento");
    const r = await enviar(app, datos, { t: JPEG_PRUEBA });
    expect(r.statusCode).toBe(201);
    expect(await jugadorRut(datos.rut)).toMatchObject({ estado: "pendiente", categoria_id: null, numero_camiseta: "99" });
    // Ya registrado: no puede volver a enviar como adulto.
    expect((await enviar(app, datos, { t: JPEG_PRUEBA })).statusCode).toBe(409);
    await app.close();
  });

  it("jugador adulto precargado: completa lo que falta sin pisar la base y avisa del teléfono", async () => {
    const adulto = await crearJugador(db, { nombre: "Valentina", fecha_nacimiento: "2001-01-01", telefono: "911111111", numero_camiseta: null });
    const app = await construirApp({ config: configTest(), db });
    const r = await enviar(app, { ...adultoCompleto(adulto.rut), nombre: "Otra" }, { t: JPEG_PRUEBA });
    expect(r.statusCode).toBe(201);
    const [s] = await solicitudes();
    expect(s).toMatchObject({ coincide_base: true, avisos: ["telefono_distinto_base"] });
    expect(await jugadorRut(adulto.rut)).toMatchObject({
      nombre: "Valentina",
      telefono: "911111111",
      fecha_nacimiento: "2001-01-01",
      numero_camiseta: "12",
      estado: "pendiente",
      solicitud_id: s?.id,
    });
    await app.close();
  });

  it("jugador adulto: un menor, un precargado sin fecha, uno con apoderado o un RUT de apoderado dan 409 sin tocar nada", async () => {
    const apoderado = await crearApoderado(db);
    const menor = await crearJugador(db, { fecha_nacimiento: "2013-01-01" });
    const sinFecha = await crearJugador(db, { fecha_nacimiento: null, telefono: null });
    const conApoderado = await crearJugador(db, { fecha_nacimiento: "2000-01-01" });
    await vincular(db, conApoderado.id, apoderado.id);
    const rutDoble = generarRutFicticio(8080);
    await crearApoderado(db, { rut: rutDoble });
    await crearJugador(db, { rut: rutDoble, fecha_nacimiento: "1990-01-01" });
    const app = await construirApp({ config: configTest(), db });
    for (const rut of [menor.rut, sinFecha.rut, conApoderado.rut, rutDoble]) {
      const r = await enviar(app, adultoCompleto(rut), { t: JPEG_PRUEBA });
      expect(r.statusCode).toBe(409);
      expect(r.json().error.codigo).toBe("conflicto");
    }
    expect(await contar("solicitudes_registro")).toBe(0);
    expect(await jugadorRut(sinFecha.rut)).toMatchObject({ fecha_nacimiento: null, telefono: null, estado: "precargado", solicitud_id: null });
    await app.close();
  });

  it("jugador adulto con datos incompletos: la misma respuesta exista o no el RUT", async () => {
    const menor = await crearJugador(db, { fecha_nacimiento: "2013-01-01" });
    const sinFecha = await crearJugador(db, { fecha_nacimiento: null, numero_camiseta: null });
    const app = await construirApp({ config: configTest(), db });
    const cuerpos = [];
    for (const rut of [menor.rut, sinFecha.rut, rutNuevo()]) {
      const r = await enviar(app, { rut, tipo: "jugador_adulto", consentimiento: true });
      cuerpos.push([r.statusCode, r.body]);
    }
    expect(cuerpos[0]?.[0]).toBe(400);
    expect(cuerpos[1]).toEqual(cuerpos[0]);
    expect(cuerpos[2]).toEqual(cuerpos[0]);
    await app.close();
  });

  it("jugador adulto no trae hijos ni otro apoderado", async () => {
    const app = await construirApp({ config: configTest(), db });
    const conHijos = await enviar(app, { ...adultoCompleto(rutNuevo()), hijos: [hijoNuevo(rutNuevo(), "t")] }, { t: JPEG_PRUEBA });
    expect(conHijos.statusCode).toBe(400);
    const conOtro = await enviar(
      app,
      { ...adultoCompleto(rutNuevo()), otro_apoderado: { nombre: "A", apellido: "B", rut: rutNuevo(), telefono: "911111111", hijos: [0] } },
      { t: JPEG_PRUEBA },
    );
    expect(conOtro.statusCode).toBe(400);
    expect(await contar("solicitudes_registro")).toBe(0);
    await app.close();
  });

  it("titular rechazado o inactivo cuenta como ya registrado: no se cambian sus datos", async () => {
    const app = await construirApp({ config: configTest(), db });
    for (const estado of ["rechazado", "inactivo"] as const) {
      const titular = await crearApoderado(db, { estado, foto_id: null });
      const r = await enviar(
        app,
        { rut: titular.rut, tipo: "apoderado", consentimiento: true, nombre: "Nueva", foto: "t", hijos: [hijoNuevo(rutNuevo())] },
        { t: JPEG_PRUEBA, h0: JPEG_PRUEBA },
      );
      expect(r.statusCode).toBe(201);
      expect(await apoderadoRut(titular.rut)).toMatchObject({ estado, nombre: "Rosa", foto_id: null });
    }
    const avisos = (await solicitudes()).map((s) => s.avisos);
    expect(avisos).toEqual([["titular_ya_registrado"], ["titular_ya_registrado"]]);
    await app.close();
  });

  it("otro apoderado precargado: solo vínculo y aviso; ni link, ni su nombre de la base, ni solicitud", async () => {
    const precargado = await crearApoderado(db, { nombre: "Ignacia", apellido: "Real" });
    const app = await construirApp({ config: configTest(), db });
    const r = await enviar(
      app,
      {
        ...apoderadoNuevo(rutNuevo()),
        hijos: [hijoNuevo(rutNuevo())],
        otro_apoderado: { nombre: "Otro", apellido: "Nombre", rut: precargado.rut, telefono: "955555555", hijos: [0] },
      },
      { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(201);
    expect(r.json().otros_apoderados).toEqual([]);
    expect(r.body).not.toContain("Ignacia");
    expect(r.body).not.toContain("Real");
    const lista = await solicitudes();
    expect(lista).toHaveLength(1);
    expect(lista[0]?.avisos).toEqual(["otro_apoderado_ya_registrado"]);
    expect(await apoderadoRut(precargado.rut)).toMatchObject({
      nombre: "Ignacia",
      estado: "precargado",
      solicitud_id: null,
      telefono: "911111111",
    });
    const vinculos = await db.select().from(jugadorApoderado).where(eq(jugadorApoderado.apoderado_id, precargado.id));
    expect(vinculos).toEqual([expect.objectContaining({ estado: "pendiente", solicitud_id: lista[0]?.id })]);
    await app.close();
  });

  it("otro apoderado hacia un hijo ya registrado de la lista: aviso de apoderado nuevo", async () => {
    const titular = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    const hijo = await crearJugador(db, {
      nombre: "Tomás",
      estado: "activo",
      numero_camiseta: "7",
      foto_id: await guardarFoto(db, JPEG_PRUEBA),
      credencial_token: "b".repeat(43),
    });
    await vincular(db, hijo.id, titular.id);
    const app = await construirApp({ config: configTest(), db });
    const r = await enviar(app, {
      rut: titular.rut,
      tipo: "apoderado",
      consentimiento: true,
      hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" } }],
      otro_apoderado: { nombre: "Intruso", apellido: "X", rut: rutNuevo(), telefono: "966666666", hijos: [0] },
    });
    expect(r.statusCode).toBe(201);
    const s = (await solicitudes()).find((x) => x.tipo === "formulario");
    expect(s?.avisos).toContain("apoderado_nuevo_para_hijo_registrado");
    await app.close();
  });

  it("el otro apoderado no puede apuntar a un hijo marcado 'ya no está'", async () => {
    const titular = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    const hijo = await crearJugador(db, { nombre: "Tomás" });
    await vincular(db, hijo.id, titular.id);
    const app = await construirApp({ config: configTest(), db });
    const r = await enviar(app, {
      rut: titular.rut,
      tipo: "apoderado",
      consentimiento: true,
      hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, ya_no_esta: true }],
      otro_apoderado: { nombre: "A", apellido: "B", rut: rutNuevo(), telefono: "966666666", hijos: [0] },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.mensaje).toContain("otro_apoderado.hijos");
    expect((await jugadorRut(hijo.rut)).marcado_retiro_en).toBeNull();
    await app.close();
  });

  it("el mismo hijo por posición y por RUT: 400", async () => {
    const titular = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: "3", foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    await vincular(db, hijo.id, titular.id);
    const app = await construirApp({ config: configTest(), db });
    const r = await enviar(
      app,
      { rut: titular.rut, tipo: "apoderado", consentimiento: true, hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" } }, hijoNuevo(hijo.rut)] },
      { h0: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(400);
    expect(r.json().error.mensaje).toContain("hijos.1.ref");
    await app.close();
  });

  it("titular ya registrado: paga_mensualidad no cambia sus vínculos existentes", async () => {
    const titular = await crearApoderado(db, { estado: "pendiente", foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    const hijo = await crearJugador(db, { nombre: "Tomás", estado: "pendiente" });
    await vincular(db, hijo.id, titular.id, { paga_mensualidad: false });
    const app = await construirApp({ config: configTest(), db });
    const r = await enviar(app, {
      rut: titular.rut,
      tipo: "apoderado",
      consentimiento: true,
      paga_mensualidad: true,
      hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" } }],
    });
    expect(r.statusCode).toBe(201);
    const [v] = await db.select().from(jugadorApoderado).where(eq(jugadorApoderado.jugador_id, hijo.id));
    expect(v?.paga_mensualidad).toBe(false);
    await app.close();
  });

  it("hay_solicitud_posterior: por un hijo de otra solicitud pendiente, sin repetirse y nunca en una revisada", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rutHijo = rutNuevo();
    await enviar(app, { ...apoderadoNuevo(rutNuevo()), hijos: [hijoNuevo(rutHijo)] }, { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA });
    const [primera] = await solicitudes();
    // Otra familia nombra al mismo hijo por RUT, dos veces.
    for (let i = 0; i < 2; i++) {
      const r = await enviar(app, { ...apoderadoNuevo(rutNuevo()), hijos: [hijoNuevo(rutHijo)] }, { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA });
      expect(r.statusCode).toBe(201);
    }
    const marcada = (await solicitudes()).find((s) => s.id === primera?.id);
    expect(marcada?.avisos).toEqual(["hay_solicitud_posterior"]);
    // Una solicitud ya revisada no se marca.
    await db.update(solicitudesRegistro).set({ estado: "revisada", avisos: [] }).where(eq(solicitudesRegistro.id, primera?.id ?? ""));
    await enviar(app, { ...apoderadoNuevo(rutNuevo()), hijos: [hijoNuevo(rutHijo)] }, { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA });
    expect((await solicitudes()).find((s) => s.id === primera?.id)?.avisos).toEqual([]);
    await app.close();
  });

  describe("fichas previas", () => {
    it("guarda cómo estaban el titular y el hijo precargados antes de modificarlos, sin RUT ni credencial", async () => {
      const titular = await crearApoderado(db, { nombre: null, email: "rosa@ejemplo.test", metodo_pago: "forpay_mensual" });
      const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: null });
      await vincular(db, hijo.id, titular.id);
      const app = await construirApp({ config: configTest(), db });
      const r = await enviar(
        app,
        {
          rut: titular.rut,
          tipo: "apoderado",
          consentimiento: true,
          nombre: "Rosa",
          foto: "t",
          hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, numero_camiseta: "8", foto: "h" }],
        },
        { t: JPEG_PRUEBA, h: JPEG_PRUEBA },
      );
      expect(r.statusCode).toBe(201);
      const [s] = await solicitudes();
      // Las copias son de la propia solicitud: no hay cambios bloqueados.
      expect(s?.avisos).not.toContain("cambios_bloqueados_por_otra_solicitud");
      const copias = await db.select().from(fichasPrevias);
      expect(copias).toHaveLength(2);
      const deApoderado = copias.find((c) => c.apoderado_id === titular.id);
      expect(deApoderado).toMatchObject({ solicitud_id: s?.id, jugador_id: null });
      expect(deApoderado?.datos).toEqual({
        nombre: null,
        apellido: "Ficticia",
        telefono: "911111111",
        email: "rosa@ejemplo.test",
        metodo_pago: "forpay_mensual",
        foto_id: null,
        estado: "precargado",
        solicitud_id: null,
      });
      const deHijo = copias.find((c) => c.jugador_id === hijo.id);
      expect(deHijo?.datos).toEqual({
        nombre: "Tomás",
        apellido: "Inventado",
        fecha_nacimiento: "2014-05-10",
        disciplina: "basketball",
        categoria_id: null,
        numero_camiseta: null,
        telefono: null,
        email: null,
        metodo_pago: null,
        foto_id: null,
        estado: "precargado",
        solicitud_id: null,
        marcado_retiro_en: null,
      });
      for (const c of copias) {
        const texto = JSON.stringify(c.datos);
        expect(texto).not.toContain(titular.rut);
        expect(texto).not.toContain(hijo.rut);
        expect(texto).not.toContain("credencial_token");
      }
      await app.close();
    });

    it("también guarda copia del jugador adulto precargado y del hijo sin apoderado nombrado por RUT", async () => {
      const adulto = await crearJugador(db, { fecha_nacimiento: "2001-01-01", numero_camiseta: null });
      const huerfano = await crearJugador(db, { numero_camiseta: null });
      const app = await construirApp({ config: configTest(), db });
      expect((await enviar(app, adultoCompleto(adulto.rut), { t: JPEG_PRUEBA })).statusCode).toBe(201);
      expect(
        (await enviar(app, { ...apoderadoNuevo(rutNuevo()), hijos: [hijoNuevo(huerfano.rut)] }, { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA }))
          .statusCode,
      ).toBe(201);
      const copias = await db.select().from(fichasPrevias);
      expect(copias.map((c) => c.jugador_id).sort()).toEqual([adulto.id, huerfano.id].sort());
      for (const c of copias) expect(c.datos).toMatchObject({ estado: "precargado", numero_camiseta: null });
      expect((await solicitudes()).map((s) => s.avisos)).toEqual([["sin_telefono_en_base"], ["hijo_precargado_completado_por_rut"]]);
      await app.close();
    });

    it("un hijo sin apoderado con copia de otra solicitud, nombrado por RUT: no se completa ni se avisa como completado", async () => {
      const mama = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
      const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: null });
      await vincular(db, hijo.id, mama.id);
      const app = await construirApp({ config: configTest(), db });
      // La mamá lo marca "ya no está" (copia de su solicitud) y Mony corta ese vínculo.
      const marca = await enviar(app, {
        rut: mama.rut,
        tipo: "apoderado",
        consentimiento: true,
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, ya_no_esta: true }],
      });
      expect(marca.statusCode).toBe(201);
      await db.delete(jugadorApoderado).where(eq(jugadorApoderado.jugador_id, hijo.id));
      const r = await enviar(app, { ...apoderadoNuevo(rutNuevo()), hijos: [hijoNuevo(hijo.rut)] }, { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA });
      expect(r.statusCode).toBe(201);
      expect(await jugadorRut(hijo.rut)).toMatchObject({ numero_camiseta: null, foto_id: null, estado: "precargado" });
      const [s1, s2] = await solicitudes();
      expect(s2?.avisos).toEqual(["cambios_bloqueados_por_otra_solicitud"]);
      expect(s1?.avisos).toContain("hay_solicitud_posterior");
      await app.close();
    });

    it("un 'ya no está' sobre un hijo con copia de otra solicitud no lo marca, no deja su aviso y le avisa a la otra", async () => {
      const mama = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
      const papa = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
      const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: null });
      await vincular(db, hijo.id, mama.id);
      await vincular(db, hijo.id, papa.id);
      const app = await construirApp({ config: configTest(), db });
      const completa = await enviar(
        app,
        { rut: mama.rut, tipo: "apoderado", consentimiento: true, hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, numero_camiseta: "4", foto: "h" }] },
        { h: JPEG_PRUEBA },
      );
      expect(completa.statusCode).toBe(201);
      const marca = await enviar(app, {
        rut: papa.rut,
        tipo: "apoderado",
        consentimiento: true,
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, ya_no_esta: true }],
      });
      expect(marca.statusCode).toBe(201);
      expect((await jugadorRut(hijo.rut)).marcado_retiro_en).toBeNull();
      const [s1, s2] = await solicitudes();
      expect(s1?.avisos).toContain("hay_solicitud_posterior");
      expect(s2?.avisos).not.toContain("hijo_marcado_ya_no_esta");
      expect(s2?.avisos).toContain("cambios_bloqueados_por_otra_solicitud");
      expect(s1?.avisos).not.toContain("cambios_bloqueados_por_otra_solicitud");
      await app.close();
    });

    /** Espera a que alguna consulta de la base de tests esté esperando un candado de fila. */
    async function esperarBloqueo() {
      for (let i = 0; i < 200; i++) {
        const [f] = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
        );
        if ((f?.n ?? 0) > 0) return;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("la solicitud nunca esperó el candado");
    }

    it.each(["titular", "hijo"] as const)(
      "si Mony cambia la foto del %s mientras llega la solicitud, la solicitud espera, la copia y no la pisa",
      async (quien) => {
        const titular = await crearApoderado(db, { nombre: null });
        const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: null });
        await vincular(db, hijo.id, titular.id);
        const tabla = quien === "titular" ? apoderados : jugadores;
        const id = quien === "titular" ? titular.id : hijo.id;
        const app = await construirApp({ config: configTest(), db });
        // Mony, en otra conexión: toma la fila como lo hace cambiarFoto y deja la foto nueva sin
        // confirmar hasta que la solicitud esté esperando.
        const mony = crearDb(urlTest(), { max: 1 });
        try {
          let soltar = () => {};
          const suelta = new Promise<void>((r) => (soltar = r));
          let fotoMony = "";
          const transaccionMony = mony.db.transaction(async (tx) => {
            await tx.select({ id: tabla.id }).from(tabla).where(eq(tabla.id, id)).for("update");
            const nueva = await guardarFoto(tx, PNG_PRUEBA);
            await tx.update(tabla).set({ foto_id: nueva }).where(eq(tabla.id, id));
            fotoMony = nueva;
            await suelta;
          });
          while (fotoMony === "") await new Promise((r) => setTimeout(r, 5));
          const envio = enviar(
            app,
            {
              rut: titular.rut,
              tipo: "apoderado",
              consentimiento: true,
              nombre: "Rosa",
              foto: "t",
              hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, numero_camiseta: "8", foto: "h" }],
            },
            { t: JPEG_PRUEBA, h: JPEG_PRUEBA },
          );
          await esperarBloqueo();
          soltar();
          await transaccionMony;
          expect((await envio).statusCode).toBe(201);

          const [ficha] = await db.select({ foto_id: tabla.foto_id }).from(tabla).where(eq(tabla.id, id));
          expect(ficha?.foto_id).toBe(fotoMony);
          const copias = await db.select().from(fichasPrevias);
          const copia = copias.find((c) => (quien === "titular" ? c.apoderado_id : c.jugador_id) === id);
          expect(copia?.datos).toMatchObject({ foto_id: fotoMony });
        } finally {
          await mony.cerrar();
          await app.close();
        }
      },
    );

    it("un hijo ya marcado por otra solicitud: la otra recibe el aviso y no se crea una copia nueva", async () => {
      const mama = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
      const papa = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
      const hijo = await crearJugador(db, { nombre: "Tomás" });
      await vincular(db, hijo.id, mama.id);
      await vincular(db, hijo.id, papa.id);
      const app = await construirApp({ config: configTest(), db });
      for (const rut of [mama.rut, papa.rut]) {
        const r = await enviar(app, {
          rut,
          tipo: "apoderado",
          consentimiento: true,
          hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, ya_no_esta: true }],
        });
        expect(r.statusCode).toBe(201);
      }
      const [s1, s2] = await solicitudes();
      expect(s1?.avisos).toContain("hay_solicitud_posterior");
      expect(s2?.avisos).not.toContain("hijo_marcado_ya_no_esta");
      expect(s2?.avisos).toContain("cambios_bloqueados_por_otra_solicitud");
      expect(s1?.avisos).not.toContain("cambios_bloqueados_por_otra_solicitud");
      const copias = await db.select().from(fichasPrevias);
      expect(copias.filter((c) => c.jugador_id === hijo.id)).toEqual([expect.objectContaining({ solicitud_id: s1?.id })]);
      await app.close();
    });

    it("un hijo ya marcado sin copia de nadie (por ejemplo, desde el panel): aviso y sin copia", async () => {
      const titular = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
      const hijo = await crearJugador(db, { nombre: "Tomás", marcado_retiro_en: new Date("2026-10-01T00:00:00Z") });
      await vincular(db, hijo.id, titular.id);
      const app = await construirApp({ config: configTest(), db });
      const r = await enviar(app, {
        rut: titular.rut,
        tipo: "apoderado",
        consentimiento: true,
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, ya_no_esta: true }],
      });
      expect(r.statusCode).toBe(201);
      expect((await solicitudes())[0]?.avisos).toEqual(["hijo_marcado_ya_no_esta"]);
      expect((await db.select().from(fichasPrevias)).filter((c) => c.jugador_id === hijo.id)).toEqual([]);
      await app.close();
    });

    it("una persona nueva no lleva copia, y una solicitud que falla no deja ninguna", async () => {
      const app = await construirApp({ config: configTest(), db });
      expect((await enviar(app, { ...apoderadoNuevo(rutNuevo()), hijos: [hijoNuevo(rutNuevo())] }, { titular: JPEG_PRUEBA, h0: JPEG_PRUEBA })).statusCode).toBe(201);
      const titular = await crearApoderado(db);
      const hijo = await crearJugador(db, { nombre: "Tomás" });
      await vincular(db, hijo.id, titular.id);
      const falla = await enviar(
        app,
        { rut: titular.rut, tipo: "apoderado", consentimiento: true, foto: "t", hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" } }] },
        { t: JPEG_PRUEBA },
      );
      expect(falla.statusCode).toBe(400);
      expect(await db.select().from(fichasPrevias)).toEqual([]);
      await app.close();
    });

    it("si otra solicitud ya modificó a la persona, la segunda no la pisa: solo vincula y le avisa a la primera", async () => {
      // Dos apoderados de la base con el mismo hijo precargado.
      const mama = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
      const papa = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
      const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: null });
      await vincular(db, hijo.id, mama.id);
      await vincular(db, hijo.id, papa.id);
      const app = await construirApp({ config: configTest(), db });
      // La primera lo marca "ya no está": queda precargado, con copia.
      const primera = await enviar(app, {
        rut: mama.rut,
        tipo: "apoderado",
        consentimiento: true,
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, ya_no_esta: true }],
      });
      expect(primera.statusCode).toBe(201);
      const fotosAntes = await contar("fotos");
      // La segunda lo completa con número y foto: no se aplica.
      const segunda = await enviar(
        app,
        {
          rut: papa.rut,
          tipo: "apoderado",
          consentimiento: true,
          hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, numero_camiseta: "4", foto: "h" }],
        },
        { h: JPEG_PRUEBA },
      );
      expect(segunda.statusCode).toBe(201);
      const j = await jugadorRut(hijo.rut);
      expect(j).toMatchObject({ numero_camiseta: null, foto_id: null, estado: "precargado", solicitud_id: null });
      expect(j.marcado_retiro_en).toBeInstanceOf(Date);
      expect(await contar("fotos")).toBe(fotosAntes);
      const [s1, s2] = await solicitudes();
      expect(s1?.avisos).toContain("hay_solicitud_posterior");
      expect(s2?.avisos).not.toContain("hay_solicitud_posterior");
      // Mony ve en la segunda que sus datos no se aplicaron por la otra.
      expect(s2?.avisos).toContain("cambios_bloqueados_por_otra_solicitud");
      expect(s1?.avisos).not.toContain("cambios_bloqueados_por_otra_solicitud");
      // La del hijo es una sola, la de la primera; cada titular precargado tiene la suya.
      const copias = await db.select().from(fichasPrevias);
      expect(copias.filter((c) => c.jugador_id === hijo.id)).toEqual([expect.objectContaining({ solicitud_id: s1?.id })]);
      expect(copias.filter((c) => c.apoderado_id !== null)).toHaveLength(2);
      await app.close();
    });
  });

  describe("multipart", () => {
    it("sin multipart, sin datos o con JSON roto: 400 validacion", async () => {
      const app = await construirApp({ config: configTest(), db });
      const json = await app.inject({ method: "POST", url: API.public.solicitudes, payload: { rut: "x" } });
      expect(json.statusCode).toBe(400);
      expect(json.json().error.codigo).toBe("validacion");
      const roto = await enviar(app, "{no es json");
      expect(roto.statusCode).toBe(400);
      expect(roto.json().error.codigo).toBe("validacion");
      const form = new FormData();
      form.append("otro", "1");
      const sinDatos = await app.inject({ method: "POST", url: API.public.solicitudes, payload: form });
      expect(sinDatos.statusCode).toBe(400);
      await app.close();
    });

    it("un archivo que no es imagen: 400 archivo_invalido", async () => {
      const app = await construirApp({ config: configTest(), db });
      const r = await enviar(app, apoderadoNuevo(rutNuevo()), { titular: Buffer.from("no soy una imagen") });
      expect(r.statusCode).toBe(400);
      expect(r.json().error.codigo).toBe("archivo_invalido");
      expect(await contar("apoderados")).toBe(0);
      await app.close();
    });

    it("una foto de más de 2 MB: 413", async () => {
      const app = await construirApp({ config: configTest(), db });
      const grande = Buffer.concat([JPEG_PRUEBA, Buffer.alloc(FOTO_MAX_BYTES)]);
      const r = await enviar(app, apoderadoNuevo(rutNuevo()), { titular: grande });
      expect(r.statusCode).toBe(413);
      expect(r.json().error.codigo).toBe("archivo_invalido");
      await app.close();
    });

    it("fotos que no calzan con los datos: 400 archivo_invalido", async () => {
      const app = await construirApp({ config: configTest(), db });
      const sobra = await enviar(app, apoderadoNuevo(rutNuevo()), { titular: JPEG_PRUEBA, extra: JPEG_PRUEBA });
      expect(sobra.json().error.codigo).toBe("archivo_invalido");
      const falta = await enviar(app, apoderadoNuevo(rutNuevo()), {});
      expect(falta.json().error.codigo).toBe("archivo_invalido");
      const repetida = await enviar(app, { ...apoderadoNuevo(rutNuevo()), hijos: [hijoNuevo(rutNuevo(), "titular")] }, { titular: JPEG_PRUEBA });
      expect(repetida.json().error.codigo).toBe("archivo_invalido");
      const form = multipart(apoderadoNuevo(rutNuevo()));
      form.append("archivo_raro", new Blob([new Uint8Array(JPEG_PRUEBA)]), "x.jpg");
      const nombreRaro = await app.inject({ method: "POST", url: API.public.solicitudes, payload: form });
      expect(nombreRaro.json().error.codigo).toBe("archivo_invalido");
      await app.close();
    });
  });

  it(`después de ${LIMITES.solicitudes.max} envíos desde la misma IP responde 429`, async () => {
    const app = await construirApp({ config: configTest(), db });
    for (let i = 0; i < LIMITES.solicitudes.max; i++) {
      expect((await enviar(app, "{}")).statusCode).toBe(400);
    }
    const r = await enviar(app, "{}");
    expect(r.statusCode).toBe(429);
    await app.close();
  });
});
