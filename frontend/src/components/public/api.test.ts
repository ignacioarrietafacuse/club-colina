import { describe, expect, it } from "vitest";
import { ErrorApi } from "@/lib/api";
import { mensajeError, statusDe } from "./api";

describe("mensajeError", () => {
  it("traduce cada código a un texto para la familia", () => {
    expect(mensajeError(new ErrorApi(429, "demasiados_intentos", "x"))).toMatch(
      /demasiados intentos/,
    );
    expect(mensajeError(new ErrorApi(409, "conflicto", "x"))).toMatch(/Vuelve a empezar/);
    expect(mensajeError(new ErrorApi(0, "sin_conexion", "x"))).toMatch(/conexión/);
    expect(mensajeError(new ErrorApi(404, "no_encontrado", "x"))).toMatch(/link no es válido/);
  });

  it("nunca repite el mensaje del servidor", () => {
    expect(mensajeError(new ErrorApi(500, "error_interno", "detalle interno"))).not.toContain(
      "detalle",
    );
    expect(mensajeError(new Error("detalle interno"))).not.toContain("detalle");
  });

  it("statusDe", () => {
    expect(statusDe(new ErrorApi(409, "conflicto", "x"))).toBe(409);
    expect(statusDe(new Error("x"))).toBeNull();
  });
});
