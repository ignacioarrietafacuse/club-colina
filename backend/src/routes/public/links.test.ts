import { API, FOTO_MAX_BYTES, type SolicitudDatos, solicitudCreadaResponse } from "@club-colina/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { construirApp } from "../../app";
import { apoderados, entrenadores, jugadorApoderado, jugadores, solicitudesRegistro } from "../../db/schema";
import { guardarFoto } from "../../lib/fotos";
import { generarToken } from "../../lib/tokens";
import { crearApoderado, crearJugador, rutNuevo, vaciarRegistro, vincular } from "../../services/registro/datos-prueba";
import { configTest, dbTest, JPEG_PRUEBA, PNG_PRUEBA } from "../../test/db";

const { db, cerrar } = dbTest();
afterAll(cerrar);
beforeEach(() => vaciarRegistro(db));

const NO_ENCONTRADO = { error: { codigo: "no_encontrado", mensaje: "No encontrado" } };

function blob(bytes: Buffer) {
  return new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
}

async function crearSolicitud(app: FastifyInstance, datos: SolicitudDatos, fotos: Record<string, Buffer>) {
  const form = new FormData();
  form.append("datos", JSON.stringify(datos));
  for (const [clave, bytes] of Object.entries(fotos)) form.append(`foto_${clave}`, blob(bytes), `${clave}.jpg`);
  const r = await app.inject({ method: "POST", url: API.public.solicitudes, payload: form });
  expect(r.statusCode).toBe(201);
  return solicitudCreadaResponse.parse(r.json());
}

async function subirFoto(app: FastifyInstance, token: string, foto: Buffer | null = JPEG_PRUEBA, consentimiento: string | null = "true") {
  const form = new FormData();
  if (consentimiento !== null) form.append("consentimiento", consentimiento);
  if (foto !== null) form.append("foto", blob(foto), "foto.jpg");
  return app.inject({ method: "POST", url: API.public.completar(token), payload: form });
}

/** Lo que haría Mony al aprobar: activo y con credencial. */
async function activar(tabla: typeof jugadores | typeof apoderados, rut: string) {
  const credencial = generarToken();
  await db.update(tabla).set({ estado: "activo", credencial_token: credencial }).where(eq(tabla.rut, rut));
  return credencial;
}

const familiaCompleta = (rut: string, rutHijo: string, rutOtro: string): SolicitudDatos => ({
  rut,
  tipo: "apoderado",
  consentimiento: true,
  nombre: "Carla",
  apellido: "Ficticia",
  telefono: "912345678",
  foto: "t",
  hijos: [
    {
      ref: { rut: rutHijo },
      nombre: "Agustina",
      apellido: "Inventada",
      fecha_nacimiento: "2014-04-04",
      disciplina: "basketball",
      numero_camiseta: "10",
      foto: "h",
    },
  ],
  otro_apoderado: { nombre: "Diego", apellido: "Prueba", rut: rutOtro, telefono: "944444444", hijos: [0] },
});

describe("GET /api/public/familia/:token", () => {
  it("muestra a las personas de la solicitud, sin datos, y el QR solo de las activas", async () => {
    const app = await construirApp({ config: configTest(), db });
    const [rut, rutHijo, rutOtro] = [rutNuevo(), rutNuevo(), rutNuevo()];
    // Un hermano que ya estaba en la base no llegó en esta solicitud: no aparece.
    const hermano = await crearJugador(db, { nombre: "Hermano" });
    const titular = await crearApoderado(db, { rut, nombre: null, telefono: null });
    await vincular(db, hermano.id, titular.id);
    const { token_acceso } = await crearSolicitud(app, familiaCompleta(rut, rutHijo, rutOtro), { t: JPEG_PRUEBA, h: PNG_PRUEBA });

    const r = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.json()).toEqual({
      estado_solicitud: "pendiente",
      personas: [
        { nombre_completo: "Carla", rol: "apoderado", estado: "pendiente" },
        { nombre_completo: "Agustina", rol: "jugador", estado: "pendiente" },
      ],
      otros_apoderados: [{ nombre_completo: "Diego", foto_subida: false }],
    });
    for (const dato of [rut, rutHijo, rutOtro, "912345678", "944444444", "2014-04-04", "Hermano", "Ficticia", "Inventada"]) {
      expect(r.body).not.toContain(dato);
    }

    // Mony aprueba al hijo y su vínculo con el titular.
    const credencial = await activar(jugadores, rutHijo);
    await db.update(jugadorApoderado).set({ estado: "activo" });
    const activa = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(activa.json().personas[1]).toEqual({
      nombre_completo: "Agustina Inventada",
      rol: "jugador",
      estado: "activo",
      credencial_token: credencial,
    });
    await app.close();
  });

  it("un RUT ajeno nombrado en la solicitud no devuelve su nombre ni su credencial hasta que Mony aprueba el vínculo", async () => {
    const app = await construirApp({ config: configTest(), db });
    const otraMadre = await crearApoderado(db);
    const ajeno = await crearJugador(db, {
      nombre: "Florencia",
      estado: "activo",
      numero_camiseta: "5",
      foto_id: await guardarFoto(db, JPEG_PRUEBA),
      credencial_token: generarToken(),
    });
    await vincular(db, ajeno.id, otraMadre.id);
    const rut = rutNuevo();
    const datos: SolicitudDatos = {
      ...familiaCompleta(rut, ajeno.rut, rutNuevo()),
      otro_apoderado: undefined,
    };
    const { token_acceso } = await crearSolicitud(app, datos, { t: JPEG_PRUEBA, h: JPEG_PRUEBA });
    const antes = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(antes.body).not.toContain("Florencia");
    expect(antes.body).not.toContain(ajeno.credencial_token ?? "x");
    expect(antes.json().personas).toHaveLength(1);

    const titular = await db.select().from(apoderados).where(eq(apoderados.rut, rut));
    await db
      .update(jugadorApoderado)
      .set({ estado: "activo" })
      .where(and(eq(jugadorApoderado.jugador_id, ajeno.id), eq(jugadorApoderado.apoderado_id, titular[0]?.id ?? "")));
    const despues = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(despues.json().personas[1]).toEqual({
      nombre_completo: "Florencia Inventado",
      rol: "jugador",
      estado: "activo",
      credencial_token: ajeno.credencial_token,
    });
    await app.close();
  });

  it("el QR de un hijo deja de verse si Mony da de baja al titular o corta el vínculo", async () => {
    const app = await construirApp({ config: configTest(), db });
    const titular = await crearApoderado(db, { foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: "3", foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    await vincular(db, hijo.id, titular.id);
    const { token_acceso } = await crearSolicitud(
      app,
      { rut: titular.rut, tipo: "apoderado", consentimiento: true, telefono: "911111111", hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" } }] },
      {},
    );
    const credencial = await activar(jugadores, hijo.rut);
    const qr = async () =>
      (await app.inject({ method: "GET", url: API.public.familia(token_acceso) })).json().personas.find(
        (p: { rol: string }) => p.rol === "jugador",
      )?.credencial_token;
    expect(await qr()).toBe(credencial);
    // Solo pendiente y activo cuentan; cualquier otro estado (también precargado, si S1 restaura
    // la ficha al rechazar) no entrega el QR.
    for (const estado of ["inactivo", "rechazado", "precargado"] as const) {
      await db.update(apoderados).set({ estado }).where(eq(apoderados.id, titular.id));
      expect(await qr()).toBeUndefined();
    }
    await db.update(apoderados).set({ estado: "pendiente" }).where(eq(apoderados.id, titular.id));
    expect(await qr()).toBe(credencial);
    await db.delete(jugadorApoderado).where(eq(jugadorApoderado.jugador_id, hijo.id));
    expect(await qr()).toBeUndefined();
    await app.close();
  });

  it("titular ya registrado que completa a un hijo precargado: el QR sale con él y se va si Mony lo da de baja", async () => {
    const app = await construirApp({ config: configTest(), db });
    const titular = await crearApoderado(db, { estado: "pendiente", foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: "3", foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    await vincular(db, hijo.id, titular.id);
    const { token_acceso } = await crearSolicitud(
      app,
      { rut: titular.rut, tipo: "apoderado", consentimiento: true, telefono: "911111111", hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" } }] },
      {},
    );
    const credencial = await activar(jugadores, hijo.rut);
    const qr = async () =>
      (await app.inject({ method: "GET", url: API.public.familia(token_acceso) })).json().personas.find(
        (p: { rol: string }) => p.rol === "jugador",
      )?.credencial_token;
    expect(await qr()).toBe(credencial);
    await db.update(apoderados).set({ estado: "inactivo" }).where(eq(apoderados.id, titular.id));
    expect(await qr()).toBeUndefined();
    await app.close();
  });

  it("titular ya registrado que además agrega un otro apoderado nuevo: el QR del hijo aparece al aprobarlo", async () => {
    const app = await construirApp({ config: configTest(), db });
    const titular = await crearApoderado(db, { estado: "pendiente", foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    const hijo = await crearJugador(db, { nombre: "Tomás", numero_camiseta: "3", foto_id: await guardarFoto(db, JPEG_PRUEBA) });
    await vincular(db, hijo.id, titular.id);
    const { token_acceso } = await crearSolicitud(
      app,
      {
        rut: titular.rut,
        tipo: "apoderado",
        consentimiento: true, telefono: "911111111",
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" } }],
        otro_apoderado: { nombre: "Diego", apellido: "Prueba", rut: rutNuevo(), telefono: "944444444", hijos: [0] },
      },
      {},
    );
    const credencial = await activar(jugadores, hijo.rut);
    const r = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(r.json().personas).toEqual([
      { nombre_completo: "Tomás Inventado", rol: "jugador", estado: "activo", credencial_token: credencial },
    ]);
    await app.close();
  });

  it("una solicitud sin titular guardado (anterior a la columna) no entrega ningún QR", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rutHijo = rutNuevo();
    const { token_acceso } = await crearSolicitud(app, familiaCompleta(rutNuevo(), rutHijo, rutNuevo()), { t: JPEG_PRUEBA, h: JPEG_PRUEBA });
    await activar(jugadores, rutHijo);
    await db.update(jugadorApoderado).set({ estado: "activo" });
    await db.update(solicitudesRegistro).set({ titular_apoderado_id: null, titular_jugador_id: null });
    const r = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(r.body).not.toContain("credencial_token");
    expect(r.json().personas.map((p: { rol: string }) => p.rol)).toEqual(["apoderado", "jugador"]);
    await app.close();
  });

  it("un hijo ajeno no aparece si Mony aprueba solo el vínculo del otro apoderado y no el del titular", async () => {
    const app = await construirApp({ config: configTest(), db });
    const madre = await crearApoderado(db);
    const ajeno = await crearJugador(db, {
      nombre: "Florencia",
      estado: "activo",
      numero_camiseta: "5",
      foto_id: await guardarFoto(db, JPEG_PRUEBA),
      credencial_token: generarToken(),
    });
    await vincular(db, ajeno.id, madre.id);
    const rut = rutNuevo();
    const rutOtro = rutNuevo();
    const { token_acceso } = await crearSolicitud(app, familiaCompleta(rut, ajeno.rut, rutOtro), { t: JPEG_PRUEBA, h: JPEG_PRUEBA });
    const [otro] = await db.select().from(apoderados).where(eq(apoderados.rut, rutOtro));
    await db
      .update(jugadorApoderado)
      .set({ estado: "activo" })
      .where(and(eq(jugadorApoderado.jugador_id, ajeno.id), eq(jugadorApoderado.apoderado_id, otro?.id ?? "")));
    const r = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(r.body).not.toContain("Florencia");
    expect(r.body).not.toContain(ajeno.credencial_token ?? "x");
    await app.close();
  });

  it("el jugador adulto titular ve su propio QR al ser aprobado", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rut = rutNuevo();
    const { token_acceso } = await crearSolicitud(
      app,
      {
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
      },
      { t: JPEG_PRUEBA },
    );
    const credencial = await activar(jugadores, rut);
    const r = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(r.json().personas).toEqual([
      { nombre_completo: "Valentina Prueba", rol: "jugador", estado: "activo", credencial_token: credencial },
    ]);
    await app.close();
  });

  it("un hijo marcado 'ya no está' no aparece", async () => {
    const app = await construirApp({ config: configTest(), db });
    const titular = await crearApoderado(db);
    const hijo = await crearJugador(db, { nombre: "Tomás" });
    await vincular(db, hijo.id, titular.id);
    const { token_acceso } = await crearSolicitud(
      app,
      {
        rut: titular.rut,
        tipo: "apoderado",
        consentimiento: true, telefono: "911111111",
        foto: "t",
        hijos: [{ ref: { precargado: 0, primer_nombre: "Tomás" }, ya_no_esta: true }],
      },
      { t: JPEG_PRUEBA },
    );
    const r = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(r.json().personas.map((p: { rol: string }) => p.rol)).toEqual(["apoderado"]);
    await app.close();
  });

  it("token mal formado, desconocido o de otro tipo de link: el mismo 404", async () => {
    const app = await construirApp({ config: configTest(), db });
    const { otros_apoderados } = await crearSolicitud(app, familiaCompleta(rutNuevo(), rutNuevo(), rutNuevo()), {
      t: JPEG_PRUEBA,
      h: JPEG_PRUEBA,
    });
    for (const token of ["corto", generarToken(), otros_apoderados[0]?.completar_token ?? ""]) {
      const r = await app.inject({ method: "GET", url: API.public.familia(token) });
      expect(r.statusCode).toBe(404);
      expect(r.json()).toEqual(NO_ENCONTRADO);
    }
    await app.close();
  });
});

describe("/api/public/completar/:token", () => {
  it("el segundo apoderado ve su nombre, sube su foto una vez y, aprobado, ve solo su propio QR", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rutOtro = rutNuevo();
    const { token_acceso, otros_apoderados } = await crearSolicitud(
      app,
      familiaCompleta(rutNuevo(), rutNuevo(), rutOtro),
      { t: JPEG_PRUEBA, h: JPEG_PRUEBA },
    );
    const token = otros_apoderados[0]?.completar_token ?? "";
    const ver = () => app.inject({ method: "GET", url: API.public.completar(token) });

    const antes = await ver();
    expect(antes.headers["cache-control"]).toBe("no-store");
    expect(antes.json()).toEqual({ primer_nombre: "Diego", foto_subida: false });

    const subida = await subirFoto(app, token);
    expect(subida.statusCode).toBe(204);
    expect((await ver()).json()).toEqual({ primer_nombre: "Diego", foto_subida: true });
    const [otro] = await db.select().from(apoderados).where(eq(apoderados.rut, rutOtro));
    expect(otro).toMatchObject({ estado: "pendiente" });
    expect(otro?.foto_id).not.toBeNull();
    const [s2] = await db.select().from(solicitudesRegistro).where(eq(solicitudesRegistro.tipo, "segundo_apoderado"));
    expect(s2?.consentimiento_en).toBeInstanceOf(Date);

    // Una sola vez: cambiarla le toca a Mony.
    expect((await subirFoto(app, token, PNG_PRUEBA)).statusCode).toBe(409);
    // /familia muestra que ya la subió.
    const familia = await app.inject({ method: "GET", url: API.public.familia(token_acceso) });
    expect(familia.json().otros_apoderados).toEqual([{ nombre_completo: "Diego", foto_subida: true }]);

    // Aprobado: ve su propio QR, y nada de la familia.
    const credencial = await activar(apoderados, rutOtro);
    await activar(jugadores, (await db.select().from(jugadores))[0]?.rut ?? "");
    const aprobado = await ver();
    expect(aprobado.json()).toEqual({ primer_nombre: "Diego", foto_subida: true, credencial_token: credencial });
    await app.close();
  });

  it("si Mony rechazó al segundo apoderado, el link ya no admite la foto", async () => {
    const app = await construirApp({ config: configTest(), db });
    const rutOtro = rutNuevo();
    const { otros_apoderados } = await crearSolicitud(app, familiaCompleta(rutNuevo(), rutNuevo(), rutOtro), {
      t: JPEG_PRUEBA,
      h: JPEG_PRUEBA,
    });
    await db.update(apoderados).set({ estado: "rechazado" }).where(eq(apoderados.rut, rutOtro));
    const r = await subirFoto(app, otros_apoderados[0]?.completar_token ?? "");
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toEqual({ codigo: "conflicto", mensaje: "Este link ya no admite cambios." });
    await app.close();
  });

  it("sin consentimiento, sin foto, con algo que no es imagen o muy grande: no se guarda nada", async () => {
    const app = await construirApp({ config: configTest(), db });
    const { otros_apoderados } = await crearSolicitud(app, familiaCompleta(rutNuevo(), rutNuevo(), rutNuevo()), {
      t: JPEG_PRUEBA,
      h: JPEG_PRUEBA,
    });
    const token = otros_apoderados[0]?.completar_token ?? "";
    const sinConsentimiento = await subirFoto(app, token, JPEG_PRUEBA, null);
    expect(sinConsentimiento.statusCode).toBe(400);
    expect(sinConsentimiento.json().error.codigo).toBe("validacion");
    expect((await subirFoto(app, token, JPEG_PRUEBA, "false")).statusCode).toBe(400);
    const sinFoto = await subirFoto(app, token, null);
    expect(sinFoto.json().error.codigo).toBe("archivo_invalido");
    const noImagen = await subirFoto(app, token, Buffer.from("texto"));
    expect(noImagen.statusCode).toBe(400);
    expect(noImagen.json().error.codigo).toBe("archivo_invalido");
    const grande = await subirFoto(app, token, Buffer.concat([JPEG_PRUEBA, Buffer.alloc(FOTO_MAX_BYTES)]));
    expect(grande.statusCode).toBe(413);
    expect(grande.json().error.codigo).toBe("archivo_invalido");
    const noMultipart = await app.inject({ method: "POST", url: API.public.completar(token), payload: { consentimiento: "true" } });
    expect(noMultipart.statusCode).toBe(400);
    const r = await app.inject({ method: "GET", url: API.public.completar(token) });
    expect(r.json().foto_subida).toBe(false);
    await app.close();
  });

  it("token mal formado, desconocido o de /familia: el mismo 404, también al subir", async () => {
    const app = await construirApp({ config: configTest(), db });
    const { token_acceso } = await crearSolicitud(app, familiaCompleta(rutNuevo(), rutNuevo(), rutNuevo()), {
      t: JPEG_PRUEBA,
      h: JPEG_PRUEBA,
    });
    for (const token of ["corto", generarToken(), token_acceso]) {
      const ver = await app.inject({ method: "GET", url: API.public.completar(token) });
      expect(ver.statusCode).toBe(404);
      expect(ver.json()).toEqual(NO_ENCONTRADO);
      const subir = await subirFoto(app, token);
      expect(subir.statusCode).toBe(404);
      expect(subir.json()).toEqual(NO_ENCONTRADO);
    }
    await app.close();
  });
});

describe("/api/public/credencial/:token", () => {
  it("una persona activa: nombre y rol, y su foto sin caché", async () => {
    const app = await construirApp({ config: configTest(), db });
    const credencial = generarToken();
    await crearJugador(db, {
      nombre: "Tomás",
      apellido: "Inventado",
      estado: "activo",
      numero_camiseta: "7",
      foto_id: await guardarFoto(db, PNG_PRUEBA),
      credencial_token: credencial,
    });
    const r = await app.inject({ method: "GET", url: API.public.credencial(credencial) });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ nombre_completo: "Tomás Inventado", rol: "jugador" });
    expect(r.headers["cache-control"]).toBe("private, no-store");
    const foto = await app.inject({ method: "GET", url: API.public.credencialFoto(credencial) });
    expect(foto.statusCode).toBe(200);
    expect(foto.headers["content-type"]).toBe("image/png");
    expect(foto.headers["cache-control"]).toBe("private, no-store");
    expect(foto.headers["x-content-type-options"]).toBe("nosniff");
    expect(foto.rawPayload.subarray(0, 8)).toEqual(PNG_PRUEBA.subarray(0, 8));
    await app.close();
  });

  it("apoderado y entrenador activos muestran su rol", async () => {
    const app = await construirApp({ config: configTest(), db });
    const tApoderado = generarToken();
    const tEntrenador = generarToken();
    const foto = await guardarFoto(db, JPEG_PRUEBA);
    await crearApoderado(db, { estado: "activo", foto_id: foto, credencial_token: tApoderado });
    await db.insert(entrenadores).values({
      nombre: "Pedro",
      apellido: "Prueba",
      rut: rutNuevo(),
      telefono: "922222222",
      disciplina: "voleibol",
      foto_id: foto,
      credencial_token: tEntrenador,
    });
    expect((await app.inject({ method: "GET", url: API.public.credencial(tApoderado) })).json()).toEqual({
      nombre_completo: "Rosa Ficticia",
      rol: "apoderado",
    });
    expect((await app.inject({ method: "GET", url: API.public.credencial(tEntrenador) })).json().rol).toBe("entrenador");
    await app.close();
  });

  it("revocado, desconocido o mal formado: el mismo 404, también la foto", async () => {
    const app = await construirApp({ config: configTest(), db });
    const credencial = generarToken();
    const j = await crearJugador(db, {
      estado: "activo",
      numero_camiseta: "7",
      foto_id: await guardarFoto(db, JPEG_PRUEBA),
      credencial_token: credencial,
    });
    // Mony lo desactiva: el token queda anulado.
    await db.update(jugadores).set({ estado: "inactivo", credencial_token: null }).where(eq(jugadores.id, j.id));
    for (const token of [credencial, generarToken(), "x"]) {
      for (const url of [API.public.credencial(token), API.public.credencialFoto(token)]) {
        const r = await app.inject({ method: "GET", url });
        expect(r.statusCode).toBe(404);
        expect(r.json()).toEqual(NO_ENCONTRADO);
      }
    }
    await app.close();
  });
});
