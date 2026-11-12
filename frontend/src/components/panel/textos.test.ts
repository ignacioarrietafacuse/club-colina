import { describe, expect, it } from "vitest";
import { nombreCompleto, textoFecha, textoFechaHora, textoNumero } from "./textos";

describe("textos del panel", () => {
  it("una fecha AAAA-MM-DD no se corre un día por la zona horaria", () => {
    expect(textoFecha("2014-01-01")).toMatch(/^1 /);
    expect(textoFecha("2014-01-01")).toContain("2014");
    expect(textoFecha(null)).toBe("—");
    expect(textoFecha("basura")).toBe("—");
  });

  it("fecha y hora inválida no rompe", () => {
    expect(textoFechaHora("no-es-fecha")).toBe("—");
    expect(textoFechaHora(null)).toBe("—");
  });

  it("99 es sin número; 0 y 00 se muestran tal cual", () => {
    expect(textoNumero("99")).toBe("Sin número (99)");
    expect(textoNumero("00")).toBe("00");
    expect(textoNumero("0")).toBe("0");
    expect(textoNumero(null)).toBe("—");
  });

  it("nombre de un precargado sin nombre", () => {
    expect(nombreCompleto({ nombre: null, apellido: null })).toBe("(sin nombre)");
    expect(nombreCompleto({ nombre: "Ana", apellido: null })).toBe("Ana");
  });
});
