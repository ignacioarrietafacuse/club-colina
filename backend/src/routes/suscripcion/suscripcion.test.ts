import { Writable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { construirApp } from "../../app";
import type { Config } from "../../config";
import { sesiones, suscripcionServicio, usuarios } from "../../db/schema";
import { configTest, dbTest, urlTest } from "../../test/db";
import { crearDb } from "../../db/cliente";
import { sql } from "drizzle-orm";
import { CANDADO_SUSCRIPCION } from "../../services/suscripcion/suscripcion";
import { COOKIE_SESION } from "@club-colina/shared";
import { crearSesion } from "../../services/panel/sesiones";
import { crearUsuario } from "../../services/panel/usuarios";
import { cadenaParaFirmar, configFlow, firmar, URL_FLOW } from "../../services/suscripcion/flow-pagos";
import { hoyEnSantiago } from "../../services/suscripcion/suscripcion";
import { hashToken } from "../../lib/tokens";
import { CLAVES_PRUEBA, FlowSimulado } from "./flow-simulado.test-utils";

const { db, cerrar } = dbTest();
afterAll(cerrar);

const BASE = "https://panel.ejemplo.test";
const EMAIL = "tesoreria@ejemplo.test";
let n = 0;

async function cookies() {
  n += 1;
  const usuario = `suscripcion${Date.now()}x${n}`;
  await crearUsuario(db, { usuario, nombre: "Mony Prueba", password: "clave-de-prueba-123" });
  const [fila] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.usuario, usuario));
  if (!fila) throw new Error("sin usuario");
  const { token } = await crearSesion(db, fila.id);
  return { [COOKIE_SESION]: token };
}

function sandbox() {
  return new FlowSimulado(URL_FLOW.sandbox, CLAVES_PRUEBA.FLOW_SANDBOX_API_KEY, CLAVES_PRUEBA.FLOW_SANDBOX_SECRET_KEY);
}

async function armar(flow: FlowSimulado, extra: Partial<Config> = {}) {
  let logs = "";
  const logStream = new Writable({
    write(chunk: Buffer, _enc, listo) {
      logs += chunk.toString();
      listo();
    },
  });
  const app = await construirApp({
    config: configTest({ FLOW_MODO: "sandbox", ...CLAVES_PRUEBA, LOG_LEVEL: "info", ...extra }),
    db,
    fetchFlow: flow.fetch,
    logStream,
  });
  return { app, cookies: await cookies(), logs: () => logs };
}

type App = Awaited<ReturnType<typeof armar>>["app"];

async function estado(app: App, c: Record<string, string>) {
  const r = await app.inject({ method: "GET", url: "/api/suscripcion", cookies: c });
  expect(r.statusCode).toBe(200);
  return r.json<{ estado: string; modo: string | null; plan: { monto: number } | null; historial: unknown[]; tarjeta: unknown }>();
}

/** Inscribe la tarjeta de punta a punta: pide la URL, "completa" en Flow y vuelve. */
async function inscribir(app: App, c: Record<string, string>, flow: FlowSimulado, email: string | undefined = EMAIL) {
  const r = await app.inject({
    method: "POST",
    url: "/api/suscripcion/inscribir-tarjeta",
    cookies: c,
    headers: { origin: BASE },
    payload: email ? { email } : {},
  });
  expect(r.statusCode).toBe(200);
  const url = new URL(r.json<{ url: string }>().url);
  const token = url.searchParams.get("token") ?? "";
  return { url, token };
}

function retorno(app: App, token: string, origin = "https://www.flow.cl") {
  return app.inject({
    method: "POST",
    url: "/api/suscripcion/retorno",
    headers: { "content-type": "application/x-www-form-urlencoded", origin },
    payload: `token=${token}`,
  });
}

beforeEach(async () => {
  await db.delete(suscripcionServicio);
});

describe("firma y configuración de Flow", () => {
  it("firma como pide la documentación: parámetros ordenados, nombre+valor, HMAC-SHA256 en hex", () => {
    const p = { currency: "CLP", apiKey: "XXXX-XXXX-XXXX", amount: 5000 };
    expect(cadenaParaFirmar(p)).toBe("amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP");
    expect(cadenaParaFirmar({ ...p, s: "ignorada" })).toBe("amount5000apiKeyXXXX-XXXX-XXXXcurrencyCLP");
    // Valor calculado aparte (openssl dgst -sha256 -hmac secreto).
    expect(firmar(p, "secreto")).toBe("2f5163be08af97de4ffdc1f16bbcac41a5ab66e087c73e6de7891f1b06f040d7");
  });

  it("elige URL y claves según FLOW_MODO, y nunca cae a producción por defecto", () => {
    const sb = configFlow(configTest({ FLOW_MODO: "sandbox", ...CLAVES_PRUEBA }));
    expect(sb).toMatchObject({ modo: "sandbox", url: "https://sandbox.flow.cl/api", apiKey: CLAVES_PRUEBA.FLOW_SANDBOX_API_KEY });
    const pr = configFlow(configTest({ FLOW_MODO: "produccion", ...CLAVES_PRUEBA }));
    expect(pr).toMatchObject({ modo: "produccion", url: "https://www.flow.cl/api", apiKey: CLAVES_PRUEBA.FLOW_PROD_API_KEY });
    expect(pr?.secretKey).toBe(CLAVES_PRUEBA.FLOW_PROD_SECRET_KEY);
    for (const modo of [undefined, "", "prod", "PRODUCCION", "live"]) {
      expect(configFlow(configTest({ FLOW_MODO: modo, ...CLAVES_PRUEBA }))).toBeNull();
    }
    expect(configFlow(configTest({ FLOW_MODO: "produccion", ...CLAVES_PRUEBA, FLOW_PROD_SECRET_KEY: undefined }))).toBeNull();
    expect(configFlow(configTest({ FLOW_MODO: "sandbox", ...CLAVES_PRUEBA, FLOW_SANDBOX_API_KEY: undefined }))).toBeNull();
  });

  it("hoy se calcula en hora de Chile", () => {
    // 02:00 UTC del 14 de noviembre son las 23:00 del 13 en Santiago (verano, UTC-3).
    expect(hoyEnSantiago(new Date("2026-11-14T02:00:00Z"))).toBe("2026-11-13");
    expect(hoyEnSantiago(new Date("2026-11-14T04:00:00Z"))).toBe("2026-11-14");
  });
});

describe("GET /api/suscripcion", () => {
  it("sin sesión responde 401 y no llama a Flow", async () => {
    const flow = sandbox();
    const { app } = await armar(flow);
    for (const [method, url] of [
      ["GET", "/api/suscripcion"],
      ["GET", "/api/suscripcion/aviso"],
      ["POST", "/api/suscripcion/inscribir-tarjeta"],
      ["POST", "/api/suscripcion/reintentar"],
    ] as const) {
      const r = await app.inject({ method, url, headers: { origin: BASE }, payload: method === "POST" ? {} : undefined });
      expect(r.statusCode).toBe(401);
    }
    expect(flow.llamadas).toHaveLength(0);
  });

  it("con modo inválido o sin claves queda pendiente de configuración, sin llamar a Flow", async () => {
    for (const extra of [{ FLOW_MODO: "prod" }, { FLOW_MODO: undefined }, { FLOW_SANDBOX_SECRET_KEY: undefined }]) {
      const flow = sandbox();
      const { app, cookies: c } = await armar(flow, extra);
      const e = await estado(app, c);
      expect(e).toMatchObject({ estado: "pendiente_configuracion", modo: null, plan: null });
      const aviso = await app.inject({ method: "GET", url: "/api/suscripcion/aviso", cookies: c });
      expect(aviso.json()).toEqual({ cobro_fallido: false });
      const ins = await app.inject({
        method: "POST",
        url: "/api/suscripcion/inscribir-tarjeta",
        cookies: c,
        headers: { origin: BASE },
        payload: { email: EMAIL },
      });
      expect(ins.statusCode).toBe(503);
      expect(flow.llamadas).toHaveLength(0);
    }
  });

  it("sin tarjeta muestra el monto leído del plan en Flow", async () => {
    const flow = sandbox();
    flow.plan.amount = 123456;
    const { app, cookies: c } = await armar(flow);
    const e = await estado(app, c);
    expect(e).toMatchObject({ estado: "sin_tarjeta", modo: "sandbox", plan: { monto: 123456 }, tarjeta: null });
  });

  it("en modo produccion usa la URL y las claves de producción", async () => {
    const flow = new FlowSimulado(URL_FLOW.produccion, CLAVES_PRUEBA.FLOW_PROD_API_KEY, CLAVES_PRUEBA.FLOW_PROD_SECRET_KEY);
    const { app, cookies: c } = await armar(flow, { FLOW_MODO: "produccion" });
    expect((await estado(app, c)).estado).toBe("sin_tarjeta");
    expect(flow.llamadas.every((l) => l.url.startsWith("https://www.flow.cl/api/"))).toBe(true);
    // Con las claves de sandbox, el Flow de producción rechaza la firma.
    const otro = new FlowSimulado(URL_FLOW.produccion, CLAVES_PRUEBA.FLOW_PROD_API_KEY, CLAVES_PRUEBA.FLOW_SANDBOX_SECRET_KEY);
    const { app: app2, cookies: c2 } = await armar(otro, { FLOW_MODO: "produccion" });
    expect((await estado(app2, c2)).estado).toBe("no_disponible");
  });

  it("si Flow está caído o tarda, responde no_disponible sin romper", async () => {
    const flow = sandbox();
    flow.falla = "caido";
    const { app, cookies: c, logs } = await armar(flow);
    expect((await estado(app, c)).estado).toBe("no_disponible");
    expect((await app.inject({ method: "GET", url: "/api/suscripcion/aviso", cookies: c })).json()).toEqual({ cobro_fallido: false });
    // Los logs dicen el modo, nunca las claves ni la firma.
    expect(logs()).toContain('"modo":"sandbox"');
    for (const v of Object.values(CLAVES_PRUEBA)) expect(logs()).not.toContain(v);
    expect(logs()).not.toMatch(/"s":|[0-9a-f]{64}/);
  });

  it("si Flow no responde, corta a los 8 s y responde no_disponible", { timeout: 15_000 }, async () => {
    const flow = sandbox();
    flow.falla = "lento";
    const { app, cookies: c } = await armar(flow);
    const inicio = Date.now();
    expect((await estado(app, c)).estado).toBe("no_disponible");
    expect(Date.now() - inicio).toBeLessThan(10_000);
  });
});

describe("inscribir la tarjeta y retorno", () => {
  it("de punta a punta: crea el cliente, vuelve de Flow, crea la suscripción desde hoy sin trial", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const { url, token } = await inscribir(app, c, flow);
    expect(url.origin).toBe("https://sandbox.flow.cl");
    const create = flow.llamadas.find((l) => l.servicio === "customer/create");
    expect(create?.parametros).toMatchObject({ name: "Club Colina", externalId: "club-colina", email: EMAIL });
    const register = flow.llamadas.find((l) => l.servicio === "customer/register");
    expect(register?.parametros.url_return).toBe(`${BASE}/api/suscripcion/retorno`);

    flow.completarRegistro(token);
    const r = await retorno(app, token);
    expect(r.statusCode).toBe(303);
    expect(r.headers.location).toBe(`${BASE}/suscripcion?resultado=ok`);
    expect(r.body).toBe("");
    const sub = flow.llamadas.find((l) => l.servicio === "subscription/create");
    expect(sub?.parametros).toMatchObject({
      planId: "suscripcion_clubcolina",
      subscription_start: hoyEnSantiago(),
      trial_period_days: "0",
    });
    const [fila] = await db.select().from(suscripcionServicio);
    expect(fila).toMatchObject({ modo: "sandbox", email: EMAIL });
    expect(fila?.flow_subscription_id).toMatch(/^sus_/);

    const e = await estado(app, c);
    expect(e).toMatchObject({ estado: "activa", tarjeta: { tipo: "Visa", ultimos4: "0366" } });
    expect(e.historial).toEqual([{ fecha: hoyEnSantiago(), monto: 200000, estado: "pagado" }]);
  });

  it("un retorno repetido (y uno por GET) no crea una segunda suscripción", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const { token } = await inscribir(app, c, flow);
    flow.completarRegistro(token);
    expect((await retorno(app, token)).headers.location).toContain("resultado=ok");
    expect((await retorno(app, token)).headers.location).toContain("resultado=ok");
    const porGet = await app.inject({ method: "GET", url: `/api/suscripcion/retorno?token=${token}` });
    expect(porGet.statusCode).toBe(303);
    expect(porGet.headers.location).toContain("resultado=ok");
    // El segundo y el tercero no vuelven a llamar a Flow.
    expect(flow.servicios().filter((s) => s === "customer/getRegisterStatus")).toHaveLength(1);
    expect(flow.servicios().filter((s) => s === "subscription/create")).toHaveLength(1);
    expect(flow.suscripciones.size).toBe(1);
    const [fila] = await db.select().from(suscripcionServicio);
    expect(fila?.flow_subscription_id).toBe([...flow.suscripciones.keys()][0]);
  });

  it("cambiar tarjeta no pide correo, no crea otro cliente ni otra suscripción", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const primera = await inscribir(app, c, flow);
    flow.completarRegistro(primera.token);
    await retorno(app, primera.token);
    const segunda = await inscribir(app, c, flow, undefined);
    flow.completarRegistro(segunda.token, true, { creditCardType: "Mastercard", last4CardDigits: "4444" });
    expect((await retorno(app, segunda.token)).headers.location).toContain("resultado=ok");
    expect(flow.clientes.size).toBe(1);
    expect(flow.suscripciones.size).toBe(1);
    expect((await estado(app, c)).tarjeta).toEqual({ tipo: "Mastercard", ultimos4: "4444" });
  });

  it("la primera vez sin correo responde 409 sin crear nada", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const r = await app.inject({
      method: "POST",
      url: "/api/suscripcion/inscribir-tarjeta",
      cookies: c,
      headers: { origin: BASE },
      payload: {},
    });
    expect(r.statusCode).toBe(409);
    expect(flow.clientes.size).toBe(0);
  });

  it("si la respuesta de subscription/create se pierde, la página reencuentra la suscripción en Flow", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const { token } = await inscribir(app, c, flow);
    flow.completarRegistro(token);
    await retorno(app, token);
    await db.update(suscripcionServicio).set({ flow_subscription_id: null });
    expect((await estado(app, c)).estado).toBe("activa");
    const [fila] = await db.select().from(suscripcionServicio);
    expect(fila?.flow_subscription_id).toBe([...flow.suscripciones.keys()][0]);
    expect(flow.suscripciones.size).toBe(1);
  });

  it("tras una cancelación, una suscripción nueva que no alcanzó a guardarse se reencuentra y su token deja de servir", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const primera = await inscribir(app, c, flow);
    flow.completarRegistro(primera.token);
    await retorno(app, primera.token);
    const vieja = [...flow.suscripciones.keys()][0];
    for (const s of flow.suscripciones.values()) s.status = 4;
    // Nueva inscripción: Flow crea la suscripción, pero el retorno no alcanza a guardarla.
    const segunda = await inscribir(app, c, flow);
    flow.completarRegistro(segunda.token);
    await flow.fetch(`${URL_FLOW.sandbox}/subscription/create`, {
      method: "POST",
      body: (() => {
        const p = { apiKey: CLAVES_PRUEBA.FLOW_SANDBOX_API_KEY, planId: "suscripcion_clubcolina", customerId: [...flow.clientes.keys()][0] ?? "", subscription_start: hoyEnSantiago(), trial_period_days: "0" };
        return new URLSearchParams({ ...p, s: firmar(p, CLAVES_PRUEBA.FLOW_SANDBOX_SECRET_KEY) }).toString();
      })(),
    });
    expect((await estado(app, c)).estado).toBe("activa");
    const [fila] = await db.select().from(suscripcionServicio);
    expect(fila?.flow_subscription_id).not.toBe(vieja);
    expect(fila?.registro_token_expira).toBeNull();
    // Cancelada también la nueva, su token ya no crea una tercera.
    for (const s of flow.suscripciones.values()) s.status = 4;
    await retorno(app, segunda.token);
    expect(flow.suscripciones.size).toBe(2);
  });

  it("si Flow tarda en crear la suscripción, un segundo retorno con el mismo token espera y responde ok", { timeout: 20_000 }, async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const { token } = await inscribir(app, c, flow);
    flow.completarRegistro(token);
    flow.demoraCreacionMs = 7_000;
    const primero = retorno(app, token);
    await new Promise((listo) => setTimeout(listo, 300));
    const segundo = retorno(app, token);
    const r = await Promise.all([primero, segundo]);
    expect(r.map((x) => x.headers.location)).toEqual([`${BASE}/suscripcion?resultado=ok`, `${BASE}/suscripcion?resultado=ok`]);
    expect(flow.suscripciones.size).toBe(1);
  });

  it("si el candado no se libera en 5 s, inscribir responde 503 sin colgarse", { timeout: 20_000 }, async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const otra = crearDb(urlTest(), { max: 1 });
    try {
      await otra.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${CANDADO_SUSCRIPCION})`);
        const r = await app.inject({
          method: "POST",
          url: "/api/suscripcion/inscribir-tarjeta",
          cookies: c,
          headers: { origin: BASE },
          payload: { email: EMAIL },
        });
        expect(r.statusCode).toBe(503);
        expect(r.json<{ error: { codigo: string } }>().error.codigo).toBe("no_disponible");
      });
    } finally {
      await otra.cerrar();
    }
    expect(flow.servicios()).not.toContain("customer/create");
  });

  it("un token inventado responde sin esperar el candado", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    await inscribir(app, c, flow);
    const otra = crearDb(urlTest(), { max: 1 });
    try {
      await otra.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${CANDADO_SUSCRIPCION})`);
        const inicio = Date.now();
        const r = await retorno(app, "TOKINVENTADO123");
        expect(r.headers.location).toContain("resultado=error");
        expect(Date.now() - inicio).toBeLessThan(2000);
      });
    } finally {
      await otra.cerrar();
    }
  });

  it("si Flow devuelve una URL de registro fuera de su sitio, no se entrega", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    flow.urlRegistro = "javascript:alert(1)";
    const r = await app.inject({
      method: "POST",
      url: "/api/suscripcion/inscribir-tarjeta",
      cookies: c,
      headers: { origin: BASE },
      payload: { email: EMAIL },
    });
    expect(r.statusCode).toBe(503);
    // El cliente quedó guardado: el próximo intento no crea otro.
    flow.urlRegistro = "https://flow.cl.otro.example/app";
    const otro = await app.inject({
      method: "POST",
      url: "/api/suscripcion/inscribir-tarjeta",
      cookies: c,
      headers: { origin: BASE },
      payload: {},
    });
    expect(otro.statusCode).toBe(503);
    flow.urlRegistro = null;
    await inscribir(app, c, flow, undefined);
    expect(flow.clientes.size).toBe(1);
  });

  it("un token que no es el de la última inscripción no llama a Flow", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    await inscribir(app, c, flow);
    flow.clientes.set("cus_ajeno", { customerId: "cus_ajeno", email: "otro@ejemplo.test", name: "Otro", externalId: "otro", status: "1" });
    flow.registros.set("TOKAJENO123", { customerId: "cus_ajeno", exito: true });
    const antes = flow.llamadas.length;
    const r = await retorno(app, "TOKAJENO123");
    expect(r.headers.location).toBe(`${BASE}/suscripcion?resultado=error`);
    expect(flow.llamadas.length).toBe(antes);
  });

  it("un retorno con un customerId ajeno no hace nada", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    await inscribir(app, c, flow);
    // Aunque el token calzara con el pendiente, Flow dice que es de otro cliente.
    flow.clientes.set("cus_ajeno", { customerId: "cus_ajeno", email: "otro@ejemplo.test", name: "Otro", externalId: "otro", status: "1" });
    flow.registros.set("TOKAJENO123", { customerId: "cus_ajeno", exito: true });
    await db.update(suscripcionServicio).set({ registro_token_hash: hashToken("TOKAJENO123") });
    const r = await retorno(app, "TOKAJENO123");
    expect(r.headers.location).toBe(`${BASE}/suscripcion?resultado=error`);
    expect(flow.servicios()).not.toContain("subscription/create");
    expect(flow.servicios()).not.toContain("customer/getSubscriptions");
  });

  it("un token viejo no vuelve a crear una suscripción cancelada en Flow", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const { token } = await inscribir(app, c, flow);
    flow.completarRegistro(token);
    await retorno(app, token);
    for (const s of flow.suscripciones.values()) s.status = 4;
    expect((await retorno(app, token)).headers.location).toContain("resultado=ok");
    const porGet = await app.inject({ method: "GET", url: `/api/suscripcion/retorno?token=${token}` });
    expect(porGet.statusCode).toBe(303);
    expect(flow.servicios().filter((s) => s === "subscription/create")).toHaveLength(1);
    expect((await estado(app, c)).estado).toBe("sin_tarjeta");
  });

  it("un token vencido no sirve", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const { token } = await inscribir(app, c, flow);
    flow.completarRegistro(token);
    await db.update(suscripcionServicio).set({ registro_token_expira: new Date(Date.now() - 1000) });
    expect((await retorno(app, token)).headers.location).toContain("resultado=error");
    expect(flow.servicios()).not.toContain("customer/getRegisterStatus");
  });

  it("dos inscripciones o dos retornos a la vez crean un solo cliente y una sola suscripción", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const pedir = () =>
      app.inject({
        method: "POST",
        url: "/api/suscripcion/inscribir-tarjeta",
        cookies: c,
        headers: { origin: BASE },
        payload: { email: EMAIL },
      });
    const [a, b] = await Promise.all([pedir(), pedir()]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(flow.servicios().filter((s) => s === "customer/create")).toHaveLength(1);
    const token = new URL(b.json<{ url: string }>().url).searchParams.get("token") ?? "";
    const ultimo = (await db.select().from(suscripcionServicio))[0]?.registro_token_hash;
    const vigente = ultimo === hashToken(token) ? token : new URL(a.json<{ url: string }>().url).searchParams.get("token") ?? "";
    flow.completarRegistro(vigente);
    const r = await Promise.all([retorno(app, vigente), retorno(app, vigente)]);
    expect(r.map((x) => x.headers.location)).toEqual([`${BASE}/suscripcion?resultado=ok`, `${BASE}/suscripcion?resultado=ok`]);
    expect(flow.suscripciones.size).toBe(1);
  });

  it("un retorno sin inscripción exitosa, con token inválido o sin registro termina en error", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const sinRegistro = await retorno(app, "TOKDESCONOCIDO1");
    expect(sinRegistro.headers.location).toContain("resultado=error");
    const { token } = await inscribir(app, c, flow);
    flow.completarRegistro(token, false);
    expect((await retorno(app, token)).headers.location).toContain("resultado=error");
    expect((await retorno(app, "no-vale!")).headers.location).toContain("resultado=error");
    expect(flow.servicios()).not.toContain("subscription/create");
  });

  it("si Flow se cae en el retorno, redirige con error", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const { token } = await inscribir(app, c, flow);
    flow.completarRegistro(token);
    flow.falla = "caido";
    expect((await retorno(app, token)).headers.location).toContain("resultado=error");
  });

  it("el retorno acepta el POST desde flow.cl, pero el resto sigue exigiendo el origen del panel", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const r = await app.inject({
      method: "POST",
      url: "/api/suscripcion/inscribir-tarjeta",
      cookies: c,
      headers: { origin: "https://www.flow.cl" },
      payload: { email: EMAIL },
    });
    expect(r.statusCode).toBe(403);
    expect((await retorno(app, "TOKDESCONOCIDO1", "https://www.flow.cl")).statusCode).toBe(303);
  });

  it("desde sandbox nunca se reemplaza un registro de producción", async () => {
    await db.insert(suscripcionServicio).values({
      id: 1,
      modo: "produccion",
      flow_customer_id: "cus_de_produccion",
      flow_subscription_id: "sus_de_produccion",
      email: EMAIL,
    });
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    expect((await estado(app, c)).estado).toBe("sin_tarjeta");
    const r = await app.inject({
      method: "POST",
      url: "/api/suscripcion/inscribir-tarjeta",
      cookies: c,
      headers: { origin: BASE },
      payload: { email: EMAIL },
    });
    expect(r.statusCode).toBe(409);
    expect(flow.servicios()).not.toContain("customer/create");
    const [fila] = await db.select().from(suscripcionServicio);
    expect(fila?.flow_subscription_id).toBe("sus_de_produccion");
  });

  it("un registro guardado con otro modo se ignora y se reemplaza al inscribir", async () => {
    await db.insert(suscripcionServicio).values({
      id: 1,
      modo: "sandbox",
      flow_customer_id: "cus_de_sandbox",
      flow_subscription_id: "sus_de_sandbox",
      email: EMAIL,
    });
    const flow = new FlowSimulado(URL_FLOW.produccion, CLAVES_PRUEBA.FLOW_PROD_API_KEY, CLAVES_PRUEBA.FLOW_PROD_SECRET_KEY);
    const { app, cookies: c } = await armar(flow, { FLOW_MODO: "produccion" });
    expect((await estado(app, c)).estado).toBe("sin_tarjeta");
    expect(flow.servicios()).toEqual(["plans/get"]);
    // Un retorno con el cliente del otro modo tampoco sirve.
    flow.registros.set("TOKOTROMODO1", { customerId: "cus_de_sandbox", exito: true });
    expect((await retorno(app, "TOKOTROMODO1")).headers.location).toContain("resultado=error");
    // Sin registro del modo activo, pide correo y crea un cliente nuevo.
    const { token } = await inscribir(app, c, flow);
    flow.completarRegistro(token);
    await retorno(app, token);
    const [fila] = await db.select().from(suscripcionServicio);
    expect(fila?.modo).toBe("produccion");
    expect(fila?.flow_customer_id).not.toBe("cus_de_sandbox");
  });
});

describe("cobro fallido, reintento y aviso", () => {
  async function conSuscripcion() {
    const flow = sandbox();
    const armado = await armar(flow);
    const { token } = await inscribir(armado.app, armado.cookies, flow);
    flow.completarRegistro(token);
    await retorno(armado.app, token);
    const sus = [...flow.suscripciones.values()][0];
    if (!sus) throw new Error("sin suscripción");
    return { ...armado, flow, sus };
  }

  it("un importe fallido marca cobro_fallido, el aviso lo cachea y reintentar lo cobra", async () => {
    const { app, cookies: c, flow, sus } = await conSuscripcion();
    expect((await app.inject({ method: "GET", url: "/api/suscripcion/aviso", cookies: c })).json()).toEqual({ cobro_fallido: false });
    sus.invoices.push({ id: 900, created: "2020-01-13 10:00:00", amount: 200000, status: 0, error: 1, due_date: "2020-01-16 00:00:00" });
    sus.morose = 1;
    // El aviso viene de la caché (15 minutos): no vuelve a llamar a Flow.
    const antes = flow.llamadas.length;
    expect((await app.inject({ method: "GET", url: "/api/suscripcion/aviso", cookies: c })).json()).toEqual({ cobro_fallido: false });
    expect(flow.llamadas.length).toBe(antes);
    // La página lee Flow en el momento y deja el aviso al día.
    const e = await estado(app, c);
    expect(e.estado).toBe("cobro_fallido");
    expect(e.historial).toContainEqual({ fecha: "2020-01-13", monto: 200000, estado: "fallido" });
    expect((await app.inject({ method: "GET", url: "/api/suscripcion/aviso", cookies: c })).json()).toEqual({ cobro_fallido: true });

    const r = await app.inject({ method: "POST", url: "/api/suscripcion/reintentar", cookies: c, headers: { origin: BASE } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ resultado: "pagado" });
    expect(flow.llamadas.find((l) => l.servicio === "invoice/retryToCollect")?.parametros.invoiceId).toBe("900");
    // Reintentar invalida la caché del aviso.
    expect((await app.inject({ method: "GET", url: "/api/suscripcion/aviso", cookies: c })).json()).toEqual({ cobro_fallido: false });
  });

  it("un rechazo de Flow al reintentar es 409, no 'no disponible'; un fallido no vencido no se reintenta", async () => {
    const { app, cookies: c, flow, sus } = await conSuscripcion();
    sus.invoices.push({ id: 901, created: "2099-01-13 10:00:00", amount: 200000, status: 0, error: 1, due_date: "2099-01-16 00:00:00" });
    const noVencido = await app.inject({ method: "POST", url: "/api/suscripcion/reintentar", cookies: c, headers: { origin: BASE } });
    expect(noVencido.statusCode).toBe(409);
    expect(flow.servicios()).not.toContain("invoice/retryToCollect");
    expect((await estado(app, c)).estado).toBe("cobro_fallido");
    sus.invoices.push({ id: 902, created: "2020-01-13 10:00:00", amount: 200000, status: 0, error: 1, due_date: "2020-01-16 00:00:00" });
    flow.rechazarReintento = true;
    const r = await app.inject({ method: "POST", url: "/api/suscripcion/reintentar", cookies: c, headers: { origin: BASE } });
    expect(r.statusCode).toBe(409);
    expect(r.json<{ error: { codigo: string } }>().error.codigo).toBe("conflicto");
  });

  it("sin tarjeta informada en Flow, una suscripción morosa sigue siendo cobro fallido", async () => {
    const { app, cookies: c, flow, sus } = await conSuscripcion();
    sus.morose = 1;
    for (const cl of flow.clientes.values()) {
      delete cl.creditCardType;
      delete cl.last4CardDigits;
    }
    const e = await estado(app, c);
    expect(e).toMatchObject({ estado: "cobro_fallido", tarjeta: null, tiene_cliente: true });
  });

  it("una fecha inválida de Flow es no_disponible, no un 500", async () => {
    const { app, cookies: c, flow } = await conSuscripcion();
    flow.proximoCobro = "0000-00-00 00:00:00";
    expect((await estado(app, c)).estado).toBe("no_disponible");
  });

  it("con clave temporal, todo /api/suscripcion menos el retorno responde 403", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    await db.update(usuarios).set({ debe_cambiar_clave: true });
    const r = await app.inject({ method: "GET", url: "/api/suscripcion", cookies: c });
    expect(r.statusCode).toBe(403);
    await db.update(usuarios).set({ debe_cambiar_clave: false });
    expect(flow.llamadas).toHaveLength(0);
  });

  it("inscribir tiene límite de intentos", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const codigos: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await app.inject({
        method: "POST",
        url: "/api/suscripcion/inscribir-tarjeta",
        cookies: c,
        headers: { origin: BASE },
        payload: {},
      });
      codigos.push(r.statusCode);
    }
    expect(codigos.slice(0, 10).every((x) => x === 409)).toBe(true);
    expect(codigos[10]).toBe(429);
  });

  it("el límite de reintentar es por usuario, no por sesión", async () => {
    const { app, cookies: c } = await conSuscripcion();
    const [sesion] = await db.select({ usuario_id: sesiones.usuario_id }).from(sesiones).where(eq(sesiones.id, hashToken(c[COOKIE_SESION] ?? "")));
    if (!sesion) throw new Error("sin sesión");
    const { token } = await crearSesion(db, sesion.usuario_id);
    const otra = { [COOKIE_SESION]: token };
    const codigos: number[] = [];
    for (const cookiesUsadas of [c, c, c, otra]) {
      const r = await app.inject({ method: "POST", url: "/api/suscripcion/reintentar", cookies: cookiesUsadas, headers: { origin: BASE } });
      codigos.push(r.statusCode);
    }
    expect(codigos).toEqual([409, 409, 409, 429]);
  });

  it("puede_reintentar solo con un importe vencido", async () => {
    const { app, cookies: c, sus } = await conSuscripcion();
    sus.invoices.push({ id: 903, created: "2099-01-13 10:00:00", amount: 200000, status: 0, error: 1, due_date: "2099-01-16 00:00:00" });
    expect(await estado(app, c)).toMatchObject({ estado: "cobro_fallido", puede_reintentar: false });
    sus.invoices.push({ id: 904, created: "2020-01-13 10:00:00", amount: 200000, status: 0, error: 0, due_date: "2020-01-16 00:00:00" });
    expect(await estado(app, c)).toMatchObject({ estado: "cobro_fallido", puede_reintentar: true });
  });

  it("reintentar sin vencidos responde 409, y tiene límite de intentos", async () => {
    const { app, cookies: c } = await conSuscripcion();
    const codigos: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await app.inject({ method: "POST", url: "/api/suscripcion/reintentar", cookies: c, headers: { origin: BASE } });
      codigos.push(r.statusCode);
    }
    expect(codigos).toEqual([409, 409, 409, 429]);
  });
});

describe("cliente del club ya creado en Flow (externalId repetido)", () => {
  async function pedirInscripcion(app: App, c: Record<string, string>) {
    return app.inject({
      method: "POST",
      url: "/api/suscripcion/inscribir-tarjeta",
      cookies: c,
      headers: { origin: BASE },
      payload: { email: EMAIL },
    });
  }

  it("con suscripción vigente la recupera y la guarda: no va a Flow ni cobra de nuevo", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    const { token } = await inscribir(app, c, flow);
    flow.completarRegistro(token);
    await retorno(app, token);
    const [cliente] = [...flow.clientes.keys()];
    const [sus] = [...flow.suscripciones.keys()];
    const historial = (await estado(app, c)).historial;
    // Se perdió la fila (o se borró): la página vuelve a "sin tarjeta" y pide el correo.
    await db.delete(suscripcionServicio);
    expect((await estado(app, c)).estado).toBe("sin_tarjeta");

    flow.llamadas = [];
    const r = await pedirInscripcion(app, c);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ resultado: "recuperada" });
    expect(flow.servicios()).toEqual(["customer/create", "customer/list", "customer/getSubscriptions"]);
    const list = flow.llamadas.find((l) => l.servicio === "customer/list");
    expect(list?.parametros).toMatchObject({ filter: "Club Colina", start: "0", limit: "100" });
    const [fila] = await db.select().from(suscripcionServicio);
    expect(fila).toMatchObject({ modo: "sandbox", flow_customer_id: cliente, flow_subscription_id: sus, registro_token_hash: null });

    const e = await estado(app, c);
    expect(e.estado).toBe("activa");
    expect(e.historial).toEqual(historial);
    expect(flow.clientes.size).toBe(1);
    expect(flow.suscripciones.size).toBe(1);
    expect(flow.servicios()).not.toContain("subscription/create");
    expect(flow.servicios()).not.toContain("customer/register");
  });

  it("sin suscripción recupera al cliente y sigue a inscribir la tarjeta, con una sola suscripción", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    await inscribir(app, c, flow); // crea el cliente y no completa la tarjeta en Flow
    const [cliente] = [...flow.clientes.keys()];
    await db.delete(suscripcionServicio);

    const r = await pedirInscripcion(app, c);
    expect(r.statusCode).toBe(200);
    const cuerpo = r.json<{ resultado: string; url: string }>();
    expect(cuerpo.resultado).toBe("flow");
    expect(flow.llamadas.at(-1)?.parametros.customerId).toBe(cliente);
    const [fila] = await db.select().from(suscripcionServicio);
    expect(fila).toMatchObject({ flow_customer_id: cliente, flow_subscription_id: null });

    const token = new URL(cuerpo.url).searchParams.get("token") ?? "";
    flow.completarRegistro(token);
    expect((await retorno(app, token)).headers.location).toBe(`${BASE}/suscripcion?resultado=ok`);
    expect(flow.clientes.size).toBe(1);
    expect(flow.suscripciones.size).toBe(1);
    expect((await estado(app, c)).estado).toBe("activa");
  });

  it("si no lo encuentra, o hay más de uno, o Flow falla al buscarlo, mantiene el error y no guarda nada", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    // Un cliente con el externalId del club pero con otro nombre: customer/list no lo trae.
    flow.clientes.set("cus_renombrado", { customerId: "cus_renombrado", email: "x@ejemplo.test", name: "Otro nombre", externalId: "club-colina", status: "1" });
    const r = await pedirInscripcion(app, c);
    expect(r.statusCode).toBe(503);
    expect(r.json<{ error: { codigo: string } }>().error.codigo).toBe("no_disponible");
    expect(await db.select().from(suscripcionServicio)).toHaveLength(0);
    // Nunca se inventa otro externalId para esquivar el rechazo.
    const creados = flow.llamadas.filter((l) => l.servicio === "customer/create");
    expect(creados.every((l) => l.parametros.externalId === "club-colina")).toBe(true);
    expect(flow.clientes.size).toBe(1);

    // Dos clientes activos que calzan: no se adivina cuál.
    flow.clientes.set("cus_a", { customerId: "cus_a", email: "a@ejemplo.test", name: "Club Colina", externalId: "club-colina", status: "1" });
    flow.clientes.set("cus_b", { customerId: "cus_b", email: "b@ejemplo.test", name: "Club Colina", externalId: "club-colina", status: "1" });
    expect((await pedirInscripcion(app, c)).statusCode).toBe(503);
    expect(await db.select().from(suscripcionServicio)).toHaveLength(0);

    // Uno solo, pero Flow cae al listar.
    flow.clientes.delete("cus_b");
    flow.fallaLista = true;
    expect((await pedirInscripcion(app, c)).statusCode).toBe(503);
    expect(await db.select().from(suscripcionServicio)).toHaveLength(0);
    expect(flow.servicios()).not.toContain("customer/register");
  });

  it("un cliente inactivo (status 0) con el mismo externalId no se recupera", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    flow.clientes.set("cus_inactivo", { customerId: "cus_inactivo", email: "x@ejemplo.test", name: "Club Colina", externalId: "club-colina", status: "0" });
    expect((await pedirInscripcion(app, c)).statusCode).toBe(503);
    expect(await db.select().from(suscripcionServicio)).toHaveLength(0);
  });

  it("recorre las páginas de customer/list (100 por página) hasta encontrarlo", async () => {
    const flow = sandbox();
    const { app, cookies: c } = await armar(flow);
    for (let i = 0; i < 150; i++) {
      flow.clientes.set(`cus_otro${i}`, { customerId: `cus_otro${i}`, email: "o@ejemplo.test", name: `Club Colina filial ${i}`, externalId: `otro-${i}`, status: "1" });
    }
    flow.clientes.set("cus_club", { customerId: "cus_club", email: "x@ejemplo.test", name: "Club Colina", externalId: "club-colina", status: "1" });
    const r = await pedirInscripcion(app, c);
    expect(r.statusCode).toBe(200);
    expect(flow.llamadas.filter((l) => l.servicio === "customer/list").map((l) => l.parametros.start)).toEqual(["0", "100"]);
    const [fila] = await db.select().from(suscripcionServicio);
    expect(fila?.flow_customer_id).toBe("cus_club");
  });
});

describe("estado del cobro según el importe, no según due_date", () => {
  async function conSuscripcion() {
    const flow = sandbox();
    const armado = await armar(flow);
    const { token } = await inscribir(armado.app, armado.cookies, flow);
    flow.completarRegistro(token);
    await retorno(armado.app, token);
    const sus = [...flow.suscripciones.values()][0];
    if (!sus) throw new Error("sin suscripción");
    sus.invoices = [];
    return { ...armado, sus };
  }

  it("un importe pagado el mismo día con due_date 3 días después es Pagado y la suscripción Activa", async () => {
    const { app, cookies: c, sus } = await conSuscripcion();
    sus.invoices.push({ id: 1, created: "2026-11-13 21:59:55", amount: 200000, status: 1, error: 0, attemp_count: 1, due_date: "2026-11-16 00:00:00" });
    const e = await estado(app, c);
    expect(e).toMatchObject({ estado: "activa", puede_reintentar: false });
    expect(e.historial).toEqual([{ fecha: "2026-11-13", monto: 200000, estado: "pagado" }]);
  });

  it("un importe impago sin intentos ni error es Pendiente aunque su due_date haya pasado; lo vencido lo dice morose", async () => {
    const { app, cookies: c, sus } = await conSuscripcion();
    sus.invoices.push({ id: 2, created: "2020-01-13 10:00:00", amount: 200000, status: 0, error: 0, attemp_count: 0, due_date: "2020-01-16 00:00:00" });
    expect(await estado(app, c)).toMatchObject({ estado: "activa", puede_reintentar: false, historial: [{ estado: "pendiente" }] });
    sus.morose = 1;
    expect(await estado(app, c)).toMatchObject({ estado: "cobro_fallido", puede_reintentar: true });
  });

  it("un importe impago con un intento de cobro hecho es Fallido aunque no tenga error ni haya vencido", async () => {
    const { app, cookies: c, sus } = await conSuscripcion();
    sus.invoices.push({ id: 3, created: "2099-01-13 10:00:00", amount: 200000, status: 0, error: 0, attemp_count: 1, due_date: "2099-01-16 00:00:00" });
    expect(await estado(app, c)).toMatchObject({ estado: "cobro_fallido", puede_reintentar: false, historial: [{ estado: "fallido" }] });
  });
});
