import { describe, expect, it } from "vitest";
import { calcularEdad, faltantesApoderado, faltantesJugador, hoyEnChile, nombreCompleto, requisitosJugador } from "./reglas";

const completo = {
  nombre: "A",
  apellido: "B",
  fecha_nacimiento: "2013-05-10",
  categoria_id: 1,
  numero_camiseta: "0",
  telefono: null,
  foto_id: "f",
};

describe("reglas del panel", () => {
  it("la fecha de hoy es la de Chile, no la de UTC", () => {
    // 02:00 UTC del 12 de noviembre todavía es 11 de noviembre en Santiago.
    expect(hoyEnChile(new Date("2026-11-12T02:00:00Z"))).toBe("2026-11-11");
    expect(hoyEnChile(new Date("2026-11-12T15:00:00Z"))).toBe("2026-11-12");
  });

  it("la edad se cumple el día del cumpleaños", () => {
    expect(calcularEdad("2008-11-12", "2026-11-11")).toBe(17);
    expect(calcularEdad("2008-11-12", "2026-11-12")).toBe(18);
    expect(calcularEdad(null)).toBeNull();
    expect(calcularEdad("2030-01-01", "2026-11-12")).toBeNull();
  });

  it("el teléfono solo falta en un adulto sin apoderado; la categoría no impide activar", () => {
    expect(faltantesJugador(completo, false, "2026-11-12")).toEqual([]);
    const adulto = { ...completo, fecha_nacimiento: "2000-01-01" };
    expect(faltantesJugador(adulto, false, "2026-11-12")).toEqual(["telefono"]);
    expect(faltantesJugador(adulto, true, "2026-11-12")).toEqual([]);
    const sinCategoria = faltantesJugador({ ...completo, categoria_id: null, foto_id: null }, true, "2026-11-12");
    expect(sinCategoria).toEqual(["categoria", "foto"]);
    expect(requisitosJugador(sinCategoria)).toEqual(["foto"]);
    expect(faltantesApoderado({ nombre: null, apellido: "X", telefono: null, foto_id: "f" })).toEqual(["nombre", "telefono"]);
  });

  it("nombre completo sin partes vacías", () => {
    expect(nombreCompleto("Ana", null)).toBe("Ana");
    expect(nombreCompleto(null, null)).toBe("(sin nombre)");
  });
});
