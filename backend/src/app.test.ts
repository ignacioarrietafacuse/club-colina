import { PassThrough } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { construirApp } from "./app";
import { LIMITES } from "./lib/limite-intentos";
import { configTest, dbTest } from "./test/db";
import { generarToken } from "./lib/tokens";
import { generarRutFicticio } from "@club-colina/shared";
import { jugadores } from "./db/schema";

const { db, cerrar } = dbTest();
afterAll(cerrar);

describe("app", () => {
  it("GET /api/health responde ok con la base arriba", async () => {
    const app = await construirApp({ config: configTest(), db });
    const r = await app.inject({ method: "GET", url: "/api/health" });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ estado: "ok" });
    await app.close();
  });

  it("lo desconocido es un 404 genérico con el formato del contrato", async () => {
    const app = await construirApp({ config: configTest(), db });
    for (const url of ["/api/nada", "/api/public/credencial/abc"]) {
      const r = await app.inject({ method: "GET", url });
      expect(r.statusCode).toBe(404);
      expect(r.json()).toEqual({ error: { codigo: "no_encontrado", mensaje: "No encontrado" } });
    }
    await app.close();
  });

  it("rechaza escrituras desde un origen ajeno y acepta el propio", async () => {
    const app = await construirApp({ config: configTest(), db });
    const ajeno = await app.inject({
      method: "POST",
      url: "/api/public/solicitudes",
      headers: { origin: "https://otro.ejemplo.test" },
    });
    expect(ajeno.statusCode).toBe(403);
    expect(ajeno.json().error.codigo).toBe("origen_no_permitido");
    const propio = await app.inject({
      method: "POST",
      url: "/api/public/solicitudes",
      headers: { origin: "https://panel.ejemplo.test" },
    });
    // Pasa la reja de origen; la ruta responde 400 porque el pedido no es multipart.
    expect(propio.statusCode).toBe(400);
    expect(propio.json().error.codigo).toBe("validacion");
    await app.close();
  });

  it("el límite de intentos responde 429 con el formato del contrato", async () => {
    const app = await construirApp({ config: configTest(), db });
    app.get("/api/prueba-limite", { config: { rateLimit: { max: 2, timeWindow: "1 minute" } } }, async () => ({ ok: true }));
    const codigos = [];
    for (let i = 0; i < 3; i++) {
      codigos.push((await app.inject({ method: "GET", url: "/api/prueba-limite" })).statusCode);
    }
    expect(codigos).toEqual([200, 200, 429]);
    const r = await app.inject({ method: "GET", url: "/api/prueba-limite" });
    expect(r.json().error.codigo).toBe("demasiados_intentos");
    expect(LIMITES.rutLookup.max).toBeGreaterThan(0);
    await app.close();
  });

  it("un error no controlado es un 500 sin detalles", async () => {
    const app = await construirApp({ config: configTest(), db });
    app.get("/api/prueba-error", async () => {
      throw new Error("detalle interno secreto");
    });
    const r = await app.inject({ method: "GET", url: "/api/prueba-error" });
    expect(r.statusCode).toBe(500);
    expect(r.body).not.toContain("secreto");
    expect(r.json().error.codigo).toBe("error_interno");
    await app.close();
  });

  it("los logs no llevan los tokens de las rutas públicas", async () => {
    const salida = new PassThrough();
    const lineas: string[] = [];
    salida.on("data", (c: Buffer) => lineas.push(c.toString()));
    const app = await construirApp({ config: configTest({ LOG_LEVEL: "trace" }), db, logStream: salida });
    const tokens = [generarToken(), generarToken(), generarToken(), generarToken()];
    await app.inject({ method: "GET", url: `/api/public/familia/${tokens[0]}` });
    await app.inject({ method: "GET", url: `/api/public/completar/${tokens[1]}?x=1` });
    await app.inject({ method: "GET", url: `/api/public/credencial/${tokens[2]}/foto` });
    await app.inject({ method: "POST", url: `/api/public/completar/${tokens[3]}`, headers: { origin: "https://malo.test" } });
    await app.close();
    const log = lineas.join("");
    // Se loguea el patrón de la ruta, nunca el token.
    expect(log).toContain('"url":"/api/public/familia/:token"');
    expect(log).toContain('"url":"/api/public/credencial/:token/foto"');
    for (const t of tokens) expect(log).not.toContain(t);
  });

  it("todo /api/panel niega sin sesión, también lo que no existe", async () => {
    const app = await construirApp({ config: configTest(), db });
    for (const [method, url] of [
      ["GET", "/api/panel/jugadores"],
      ["GET", "/api/panel/dashboard"],
      ["POST", "/api/panel/jugadores/x/activar"],
      ["GET", "/api/panel/no-existe"],
    ] as const) {
      const r = await app.inject({ method, url });
      expect(r.statusCode).toBe(401);
      expect(r.json().error.codigo).toBe("no_autenticado");
    }
    await app.close();
  });

  it("toda respuesta lleva nosniff", async () => {
    const app = await construirApp({ config: configTest(), db });
    const r = await app.inject({ method: "GET", url: "/api/health" });
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    await app.close();
  });

  it("un error de base no deja datos personales en el log", async () => {
    const salida = new PassThrough();
    const lineas: string[] = [];
    salida.on("data", (c: Buffer) => lineas.push(c.toString()));
    const app = await construirApp({ config: configTest({ LOG_LEVEL: "trace" }), db, logStream: salida });
    const rut = generarRutFicticio(901);
    const telefono = "934567812";
    app.get("/api/prueba-duplicado", async () => {
      const fila = { rut, telefono, disciplina: "voleibol" as const, origen: "formulario" as const };
      await db.insert(jugadores).values(fila);
      await db.insert(jugadores).values(fila);
      return { ok: true };
    });
    const r = await app.inject({ method: "GET", url: "/api/prueba-duplicado" });
    await app.close();
    expect(r.statusCode).toBe(500);
    const log = lineas.join("");
    expect(log).toContain("23505");
    expect(log).toContain("jugadores_rut_unique");
    expect(log).not.toContain(rut);
    expect(log).not.toContain(telefono);
    expect(log).not.toContain("params");
  });
});
