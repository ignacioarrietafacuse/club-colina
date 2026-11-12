import { PassThrough } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { generarRutFicticio } from "@club-colina/shared";
import { construirApp } from "../app";
import { configTest, dbTest } from "../test/db";
import { censurarUrl, rutaSinConsulta } from "./logs";

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
    expect(log).toContain('"url":"/api/panel/jugadores"');
    expect(log).toContain("error no controlado");
    expect(log).not.toContain("q=");
    for (const v of [...valores, cuerpo ?? "", "Florinda", "Inventad"]) expect(log).not.toContain(v);
  });
});
