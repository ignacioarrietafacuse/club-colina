import { PassThrough } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { credencialResponse, familiaResponse, generarRutFicticio, rutLookupRequest } from "@club-colina/shared";
import { construirApp } from "../app";
import { configTest, dbTest } from "../test/db";
import { respuesta, validarEntrada } from "./validar";

const { db, cerrar } = dbTest();
afterAll(cerrar);

describe("validarEntrada y respuesta", () => {
  it("respuesta descarta campos de más, también anidados", () => {
    const rut = generarRutFicticio(77);
    const c = respuesta(credencialResponse, {
      nombre_completo: "Ana Prueba",
      rol: "jugador",
      ...{ rut, telefono: "912345678" },
    });
    expect(JSON.stringify(c)).not.toContain(rut);
    const f = respuesta(familiaResponse, {
      estado_solicitud: "pendiente",
      personas: [{ nombre_completo: "Ana", rol: "jugador", estado: "pendiente", ...{ rut } }],
      otros_apoderados: [],
    });
    expect(JSON.stringify(f)).not.toContain(rut);
  });

  it("respuesta que no cumple el contrato lanza (error del servidor)", () => {
    const fueraDeContrato = JSON.parse('{"nombre_completo":"Ana","rol":"otro"}');
    expect(() => respuesta(credencialResponse, fueraDeContrato)).toThrow();
  });

  it("validarEntrada responde 400 con nombres de campos y sin valores", () => {
    const valor = "999999999-9";
    try {
      validarEntrada(rutLookupRequest, { rut: valor });
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ status: 400, codigo: "validacion" });
      expect(String(error instanceof Error ? error.message : "")).toContain("rut");
      expect(String(error instanceof Error ? error.message : "")).not.toContain(valor);
    }
  });

  it("un ZodError suelto en un handler es 500 y no deja valores en el log", async () => {
    const salida = new PassThrough();
    const lineas: string[] = [];
    salida.on("data", (c: Buffer) => lineas.push(c.toString()));
    const app = await construirApp({ config: configTest({ LOG_LEVEL: "trace" }), db, logStream: salida });
    const secreto = "valor-que-no-debe-aparecer";
    app.get("/api/prueba-zod", async () => z.object({ n: z.number() }).parse({ n: secreto }));
    const r = await app.inject({ method: "GET", url: "/api/prueba-zod" });
    await app.close();
    expect(r.statusCode).toBe(500);
    expect(lineas.join("")).not.toContain(secreto);
  });
});
