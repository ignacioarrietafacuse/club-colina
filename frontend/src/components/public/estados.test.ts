import { describe, expect, it } from "vitest";
import { ErrorApi } from "@/lib/api";
import { esNoEncontrado, tokenConForma } from "./estados";

describe("tokenConForma", () => {
  it("43 caracteres base64url", () => {
    expect(tokenConForma("A".repeat(43))).toBe(true);
    expect(tokenConForma("A".repeat(42))).toBe(false);
    expect(tokenConForma(`${"A".repeat(42)}/`)).toBe(false);
  });
});

describe("esNoEncontrado", () => {
  it("404 y otros 4xx: no válida", () => {
    expect(esNoEncontrado(new ErrorApi(404, "no_encontrado", "x"))).toBe(true);
    expect(esNoEncontrado(new ErrorApi(400, "validacion", "x"))).toBe(true);
  });

  it("sin red, 429, 5xx o un error cualquiera: no se pudo verificar", () => {
    expect(esNoEncontrado(new ErrorApi(0, "sin_conexion", "x"))).toBe(false);
    expect(esNoEncontrado(new ErrorApi(429, "demasiados_intentos", "x"))).toBe(false);
    expect(esNoEncontrado(new ErrorApi(500, "error_interno", "x"))).toBe(false);
    expect(esNoEncontrado(new Error("x"))).toBe(false);
  });
});
