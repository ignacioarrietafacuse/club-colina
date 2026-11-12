import { describe, expect, it } from "vitest";
import { calcularDv, esRutValido, generarRutFicticio, normalizarRut, RUT_NORMALIZADO } from "./rut";

describe("rut", () => {
  it("calcula el dígito verificador, incluidos 0 y K", () => {
    expect(calcularDv("11111111")).toBe("1");
    expect(calcularDv("12345678")).toBe("5");
    expect(calcularDv("10000013")).toBe("K");
    expect(calcularDv("10000004")).toBe("0");
  });

  it("normaliza cualquier forma de escribirlo", () => {
    expect(normalizarRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizarRut("123456785")).toBe("12345678-5");
    expect(normalizarRut(" 12345678 - 5 ")).toBe("12345678-5");
    expect(normalizarRut("10.000.013-k")).toBe("10000013-K");
    expect(normalizarRut("1.000.000-9")).toBe("1000000-9");
  });

  it("rechaza dígito verificador inválido y formatos raros", () => {
    expect(normalizarRut("12345678-9")).toBeNull();
    expect(normalizarRut("abc")).toBeNull();
    expect(normalizarRut("")).toBeNull();
    expect(normalizarRut("123-4")).toBeNull();
    expect(normalizarRut("12345678-X")).toBeNull();
    expect(esRutValido("12345678-5")).toBe(true);
  });

  it("genera RUT ficticios válidos y normalizados", () => {
    for (let i = 0; i < 500; i++) {
      const rut = generarRutFicticio();
      expect(rut).toMatch(RUT_NORMALIZADO);
      expect(normalizarRut(rut)).toBe(rut);
    }
    expect(generarRutFicticio(7)).toBe(generarRutFicticio(7));
  });
});
