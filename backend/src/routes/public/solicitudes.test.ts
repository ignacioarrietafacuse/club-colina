import { API, FOTO_MAX_BYTES, generarRutFicticio, type SolicitudDatos } from "@club-colina/shared";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { construirApp } from "../../app";
import { apoderados, categorias, jugadorApoderado, jugadores, solicitudesRegistro } from "../../db/schema";
import { guardarFoto } from "../../lib/fotos";
import { LIMITES } from "../../lib/limite-intentos";
import { hashToken } from "../../lib/tokens";
import { crearApoderado, crearJugador, rutNuevo, vaciarRegistro, vincular } from "../../services/registro/datos-prueba";
import { configTest, dbTest, JPEG_PRUEBA, PNG_PRUEBA } from "../../test/db";

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
      { ...apoderadoNuevo(rutNuevo()), hijos: [{ ...hijoNuevo(rutHijo), disciplina: "voleibol", fecha_nacimiento: "2015-01-01", categoria_id: u9?.id }] },
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
    expect((await solicitudes())[0]?.avisos).toEqual([]);
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

  it("jugador adulto precargado: completa lo que falta; si la base dice menor, 409; si su RUT es apoderado, 409", async () => {
    const adulto = await crearJugador(db, { fecha_nacimiento: "2001-01-01", telefono: null });
    const menor = await crearJugador(db, { fecha_nacimiento: "2013-01-01" });
    const rutDoble = generarRutFicticio(8080);
    await crearApoderado(db, { rut: rutDoble });
    await crearJugador(db, { rut: rutDoble, fecha_nacimiento: "1990-01-01" });
    const app = await construirApp({ config: configTest(), db });
    const base = { tipo: "jugador_adulto" as const, consentimiento: true as const, telefono: "977777777", numero_camiseta: "12", foto: "t" };
    const fotos = { t: JPEG_PRUEBA };
    expect((await enviar(app, { ...base, rut: menor.rut }, fotos)).statusCode).toBe(409);
    expect((await enviar(app, { ...base, rut: rutDoble }, fotos)).statusCode).toBe(409);
    const r = await enviar(app, { ...base, rut: adulto.rut }, fotos);
    expect(r.statusCode).toBe(201);
    const [s] = await solicitudes();
    expect(s).toMatchObject({ coincide_base: true, avisos: ["sin_telefono_en_base"] });
    expect(await jugadorRut(adulto.rut)).toMatchObject({ telefono: "977777777", numero_camiseta: "12", estado: "pendiente", solicitud_id: s?.id });
    await app.close();
  });

  it("un adulto sin fecha en la base que escribe una de menor: 400", async () => {
    const sinFecha = await crearJugador(db, { fecha_nacimiento: null, telefono: "988888888" });
    const app = await construirApp({ config: configTest(), db });
    const r = await enviar(
      app,
      { rut: sinFecha.rut, tipo: "jugador_adulto", consentimiento: true, fecha_nacimiento: "2015-05-05", numero_camiseta: "3", foto: "t" },
      { t: JPEG_PRUEBA },
    );
    expect(r.statusCode).toBe(400);
    expect(r.json().error.mensaje).toContain("fecha_nacimiento");
    await app.close();
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
