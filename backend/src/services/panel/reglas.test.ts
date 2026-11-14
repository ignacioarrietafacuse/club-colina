import { describe, expect, it } from "vitest";
import {
  calcularEdad,
  faltantesApoderado,
  faltantesJugador,
  hoyEnChile,
  nombreCompleto,
} from "./reglas";

const completo = {
  nombre: "A",
  apellido: "B",
  fecha_nacimiento: "2013-05-10",
  disciplina: "voleibol",
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

  it("el teléfono falta en un adulto (o de edad desconocida) sin apoderado vigente", () => {
    expect(faltantesJugador(completo, false, "2026-11-12")).toEqual([]);
    const adulto = { ...completo, fecha_nacimiento: "2000-01-01" };
    expect(faltantesJugador(adulto, false, "2026-11-12")).toEqual(["telefono"]);
    expect(faltantesJugador(adulto, true, "2026-11-12")).toEqual([]);
    const sinFecha = { ...completo, fecha_nacimiento: null };
    expect(faltantesJugador(sinFecha, false, "2026-11-12")).toEqual(["fecha_nacimiento", "telefono"]);
    expect(faltantesJugador(sinFecha, true, "2026-11-12")).toEqual(["fecha_nacimiento"]);
  });

  it("la categoría nunca falta (se calcula); una fecha vacía o inválida sí", () => {
    // Vóley 2017: sin categoría, pero no falta nada: no se pregunta.
    expect(faltantesJugador({ ...completo, fecha_nacimiento: "2017-03-01" }, true, "2026-11-12")).toEqual([]);
    // Fecha imposible (futura o antes de 1900): se pide de nuevo.
    expect(faltantesJugador({ ...completo, fecha_nacimiento: "2999-01-01" }, true, "2026-11-12")).toEqual(["fecha_nacimiento"]);
    expect(faltantesJugador({ ...completo, fecha_nacimiento: "1800-01-01" }, true, "2026-11-12")).toEqual(["fecha_nacimiento"]);
  });

  it("un campo vacío falta solo si es null, igual que el filtro en SQL", () => {
    expect(faltantesApoderado({ nombre: null, apellido: "X", telefono: null, foto_id: "f" })).toEqual(["nombre", "telefono"]);
    expect(faltantesApoderado({ nombre: "", apellido: "X", telefono: "912345678", foto_id: "f" })).toEqual([]);
  });

  it("nombre completo sin partes vacías", () => {
    expect(nombreCompleto("Ana", null)).toBe("Ana");
    expect(nombreCompleto(null, null)).toBe("(sin nombre)");
  });
});
