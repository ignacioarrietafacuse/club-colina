import { afterAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { construirApp } from "../app";
import { configTest, dbTest } from "../test/db";
import { generarToken } from "./tokens";
import { CABECERA_IP, CABECERA_PROXY, LIMITES, llaveIp } from "./limite-intentos";

const { db, cerrar } = dbTest();
afterAll(cerrar);
const SECRETO = generarToken();

/** App con una ruta de prueba que permite 2 peticiones por llave. */
async function appConRuta(secreto?: string) {
  const app = await construirApp({ config: configTest({ PROXY_SECRETO: secreto }), db });
  app.get("/api/prueba", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async () => ({
    ok: true,
  }));
  app.post("/api/prueba-login", { config: { rateLimit: { ...LIMITES.login, max: 2 } } }, async () => ({
    ok: true,
  }));
  return app;
}

async function codigos(app: FastifyInstance, cabeceras: Record<string, string>[]) {
  const salida: number[] = [];
  for (const headers of cabeceras) {
    salida.push((await app.inject({ method: "GET", url: "/api/prueba", headers })).statusCode);
  }
  return salida;
}

describe("límite de intentos: la llave es la IP real", () => {
  it("cambiar X-Forwarded-For no da intentos nuevos (trustProxy false)", async () => {
    const app = await appConRuta();
    const r = await codigos(app, [
      { "x-forwarded-for": "203.0.113.1" },
      { "x-forwarded-for": "203.0.113.2" },
      { "x-forwarded-for": "203.0.113.3" },
    ]);
    expect(r).toEqual([200, 200, 429]);
    await app.close();
  });

  it("directo a Railway manda x-real-ip; inventar la IP sin secreto no sirve", async () => {
    const app = await appConRuta(SECRETO);
    const real = { "x-real-ip": "198.51.100.7" };
    const r = await codigos(app, [
      { ...real, [CABECERA_IP]: "203.0.113.1", "x-vercel-forwarded-for": "203.0.113.4" },
      { ...real, [CABECERA_IP]: "203.0.113.2" },
      { ...real, [CABECERA_IP]: "203.0.113.3", [CABECERA_PROXY]: "secreto-equivocado" },
    ]);
    expect(r).toEqual([200, 200, 429]);
    // Otra IP real tiene su propio contador.
    expect(await codigos(app, [{ "x-real-ip": "198.51.100.8" }])).toEqual([200]);
    await app.close();
  });

  it("con el secreto del middleware, cada usuario de Vercel tiene su contador", async () => {
    const app = await appConRuta(SECRETO);
    // x-real-ip es la salida de Vercel, la misma para todos.
    const vercel = { "x-real-ip": "98.92.0.1", [CABECERA_PROXY]: SECRETO };
    const a = { ...vercel, [CABECERA_IP]: "203.0.113.10" };
    const b = { ...vercel, [CABECERA_IP]: "203.0.113.11" };
    expect(await codigos(app, [a, a, b, b, a])).toEqual([200, 200, 200, 200, 429]);
    await app.close();
  });

  it("con secreto, una IP inválida cae a x-real-ip y no abre un contador nuevo", async () => {
    const app = await appConRuta(SECRETO);
    const base = { "x-real-ip": "98.92.0.9", [CABECERA_PROXY]: SECRETO };
    const r = await codigos(app, [
      { ...base, [CABECERA_IP]: "no-es-ip" },
      { ...base, [CABECERA_IP]: "" },
      { ...base, [CABECERA_IP]: "otra-cosa" },
    ]);
    expect(r).toEqual([200, 200, 429]);
    await app.close();
  });

  it("las direcciones del mismo /64 comparten contador; una IPv4 mapeada cuenta como IPv4", async () => {
    expect(llaveIp("2001:db8:abcd:12:1::1")).toBe("2001:db8:abcd:12::/64");
    expect(llaveIp("2001:0db8:abcd:0012:ffff:ffff:ffff:ffff")).toBe("2001:db8:abcd:12::/64");
    expect(llaveIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(llaveIp("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(llaveIp("203.0.113.5")).toBe("203.0.113.5");
    const app = await appConRuta();
    const r = await codigos(app, [
      { "x-real-ip": "2001:db8:abcd:12::1" },
      { "x-real-ip": "2001:db8:abcd:12::2" },
      { "x-real-ip": "2001:db8:abcd:12:ffff::3" },
    ]);
    expect(r).toEqual([200, 200, 429]);
    await app.close();
  });

  it("sin PROXY_SECRETO en el backend, la cabecera del proxy se ignora", async () => {
    const app = await appConRuta();
    const h = { "x-real-ip": "98.92.0.2", [CABECERA_PROXY]: "cualquiera" };
    const r = await codigos(app, [
      { ...h, [CABECERA_IP]: "203.0.113.20" },
      { ...h, [CABECERA_IP]: "203.0.113.21" },
      { ...h, [CABECERA_IP]: "203.0.113.22" },
    ]);
    expect(r).toEqual([200, 200, 429]);
    await app.close();
  });

  it("el log dice si pasó por el proxy, sin el secreto", async () => {
    const lineas: string[] = [];
    const { PassThrough } = await import("node:stream");
    const logStream = new PassThrough();
    logStream.on("data", (c: Buffer) => lineas.push(c.toString()));
    const app = await construirApp({
      config: configTest({ PROXY_SECRETO: SECRETO, LOG_LEVEL: "info" }),
      db,
      logStream,
    });
    await app.inject({ method: "GET", url: "/api/health", headers: { [CABECERA_PROXY]: SECRETO } });
    await app.inject({ method: "GET", url: "/api/health" });
    await app.close();
    const log = lineas.join("");
    expect(log).toContain('"proxy":true');
    expect(log).toContain('"proxy":false');
    expect(log).not.toContain(SECRETO);
  });

  it("en el login la llave es usuario + IP", async () => {
    const app = await appConRuta();
    const login = (usuario: string) =>
      app.inject({
        method: "POST",
        url: "/api/prueba-login",
        headers: { origin: "https://panel.ejemplo.test", "x-real-ip": "198.51.100.30" },
        payload: { usuario, password: "x" },
      });
    expect((await login("mony")).statusCode).toBe(200);
    expect((await login("MONY ")).statusCode).toBe(200);
    expect((await login("mony")).statusCode).toBe(429);
    // Otro usuario desde la misma IP tiene su propio contador.
    expect((await login("otro")).statusCode).toBe(200);
    await app.close();
  });
});
