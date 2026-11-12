import { PassThrough } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { generarRutFicticio } from "@club-colina/shared";
import { construirApp } from "../app";
import { configTest, dbTest } from "../test/db";
import { censurarUrl, limpiarArgumentosDeLog, rutaSinConsulta } from "./logs";
import { generarToken } from "./tokens";

const { db, cerrar } = dbTest();
afterAll(cerrar);

describe("logs sin la consulta de la URL", () => {
  it("rutaSinConsulta corta en ? y en #", () => {
    expect(rutaSinConsulta("/api/panel/jugadores?q=x&estado=activo")).toBe("/api/panel/jugadores");
    expect(rutaSinConsulta("/api/x#frag")).toBe("/api/x");
    expect(rutaSinConsulta("/api/x")).toBe("/api/x");
    expect(censurarUrl(rutaSinConsulta("/api/public/familia/abc?q=1"))).toBe("/api/public/familia/[censurado]");
  });

  it("ni el RUT, ni el teléfono, ni el nombre buscados aparecen en ninguna línea, tampoco en las de error", async () => {
    const lineas: string[] = [];
    const salida = new PassThrough();
    salida.on("data", (c: Buffer) => lineas.push(c.toString()));
    const app = await construirApp({ config: configTest({ LOG_LEVEL: "trace" }), db, logStream: salida });
    app.get("/api/prueba-busqueda", async () => ({ ok: true }));
    app.get("/api/prueba-busqueda-error", async () => {
      throw new Error("falla interna");
    });

    const rut = generarRutFicticio();
    const [cuerpo, dv] = rut.split("-");
    const rutConPuntos = `${cuerpo?.slice(0, 2)}.${cuerpo?.slice(2, 5)}.${cuerpo?.slice(5)}-${dv}`;
    const telefono = "987650123";
    const nombre = "Florinda Inventadísima";
    const valores = [rut, rutConPuntos, telefono, nombre, encodeURIComponent(nombre)];

    for (const q of valores) {
      const consulta = `?q=${encodeURIComponent(q)}&estado=activo`;
      // Una ruta que responde, una que falla (500), una del panel sin sesión (401) y una que no existe.
      expect((await app.inject({ method: "GET", url: `/api/prueba-busqueda${consulta}` })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: `/api/prueba-busqueda-error${consulta}` })).statusCode).toBe(500);
      expect((await app.inject({ method: "GET", url: `/api/panel/jugadores${consulta}` })).statusCode).toBe(401);
      expect((await app.inject({ method: "GET", url: `/api/no-existe${consulta}` })).statusCode).toBe(404);
    }
    await app.close();

    const log = lineas.join("");
    expect(log).toContain('"url":"/api/prueba-busqueda"');
    expect(log).toContain('"url":"/api/prueba-busqueda-error"');
    expect(log).toContain('"url":"(sin ruta)"');
    expect(log).toContain("error no controlado");
    expect(log).not.toContain("q=");
    for (const v of [...valores, cuerpo ?? "", "Florinda", "Inventad"]) expect(log).not.toContain(v);
  });

  it("se loguea el patrón de la ruta: ni tokens, ni URLs inventadas, ni 404 con texto", async () => {
    const lineas: string[] = [];
    const salida = new PassThrough();
    salida.on("data", (c: Buffer) => lineas.push(c.toString()));
    const app = await construirApp({ config: configTest({ LOG_LEVEL: "trace" }), db, logStream: salida });
    app.get("/api/prueba-token/:token", async () => ({ ok: true }));
    const token = generarToken();
    await app.inject({ method: "GET", url: `/api/prueba-token/${token}?x=1` });
    for (const url of [
      `/api/public/%66amilia/${token}`,
      `/api//public/familia/${token}`,
      `/api/public/familia%2F${token}`,
      "/api/panel/jugadores;q=MARCADOR",
      "/api/panel/jugadores%3Fq=MARCADOR",
      "/MARCADOR",
    ]) {
      await app.inject({ method: "GET", url });
    }
    await app.close();
    const log = lineas.join("");
    expect(log).toContain('"url":"/api/prueba-token/:token"');
    expect(log).toContain('"url":"(sin ruta)"');
    expect(log).not.toContain(token);
    expect(log).not.toContain("MARCADOR");
  });

  it("responder dos veces no deja la URL con su consulta en el mensaje", async () => {
    const lineas: string[] = [];
    const salida = new PassThrough();
    salida.on("data", (c: Buffer) => lineas.push(c.toString()));
    const app = await construirApp({ config: configTest({ LOG_LEVEL: "trace" }), db, logStream: salida });
    app.get("/api/prueba-doble", async (_request, reply) => {
      await reply.send({ a: 1 });
      return { b: 2 };
    });
    const rut = generarRutFicticio();
    await app.inject({ method: "GET", url: `/api/prueba-doble?q=${rut}` });
    await app.close();
    const log = lineas.join("");
    expect(log).toContain("FST_ERR_REP_ALREADY_SENT");
    expect(log).not.toContain(rut);
    expect(log).not.toContain("q=");
  });

  it("limpiarArgumentosDeLog: mensaje fijo para un err sin texto; los textos pierden consulta y tokens", () => {
    const err = Object.assign(new Error("Failed query: select ... params: 12345678-5"), { code: "23505" });
    const conErr: unknown[] = [{ err }];
    limpiarArgumentosDeLog(conErr);
    expect(conErr[1]).toBe("error 23505");
    const token = generarToken();
    const texto: unknown[] = [`Reply was already sent in "/api/public/familia/${token}?q=12345678-5" (GET)`];
    limpiarArgumentosDeLog(texto);
    expect(texto[0]).toContain('Reply was already sent in "/api/public/familia/[censurado]');
    expect(texto[0]).not.toContain(token);
    expect(texto[0]).not.toContain("12345678");
    const objeto: unknown[] = [{ accion: "activar" }, "panel: credencial"];
    limpiarArgumentosDeLog(objeto);
    expect(objeto).toEqual([{ accion: "activar" }, "panel: credencial"]);
  });

  it("un Error como primer argumento, o bajo otra clave, tampoco deja su mensaje ni sus parámetros", async () => {
    const solo: unknown[] = [Object.assign(new Error("Failed query params: 12345678-5"), { code: "23505" })];
    limpiarArgumentosDeLog(solo);
    expect(solo[1]).toBe("error 23505");
    expect(JSON.stringify(solo[0])).not.toContain("12345678");

    const errorDrizzle = Object.assign(new Error("Failed query"), { params: ["12345678-5"], query: "select" });
    const original = { error: errorDrizzle, accion: "x" };
    const otraClave: unknown[] = [original, "falló algo"];
    limpiarArgumentosDeLog(otraClave);
    expect(JSON.stringify(otraClave[0])).not.toContain("12345678");
    expect(original.error).toBe(errorDrizzle); // no toca el objeto del llamador

    const lineas: string[] = [];
    const salida = new PassThrough();
    salida.on("data", (c: Buffer) => lineas.push(c.toString()));
    const app = await construirApp({ config: configTest({ LOG_LEVEL: "info" }), db, logStream: salida });
    const rut = generarRutFicticio();
    app.get("/api/prueba-log-error", async (request) => {
      const e = Object.assign(new Error(`Failed query params: ${rut}`), { params: [rut] });
      request.log.error(e);
      request.log.error({ error: e }, "con otra clave");
      return { ok: true };
    });
    await app.inject({ method: "GET", url: "/api/prueba-log-error" });
    await app.close();
    const log = lineas.join("");
    expect(log).toContain("con otra clave");
    expect(log).not.toContain(rut);
  });
});
