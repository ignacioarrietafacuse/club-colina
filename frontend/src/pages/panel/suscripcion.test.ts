import { describe, expect, it } from "vitest";
import { nav } from "@/components/panel/navegacion";
import {
  busquedaSuscripcion,
  esUrlDeFlow,
  formatoFecha,
  formatoMonto,
  mensajeResultado,
} from "./suscripcion";

describe("suscripción", () => {
  it("solo acepta ?resultado=ok o error", () => {
    expect(busquedaSuscripcion({ resultado: "ok" })).toEqual({ resultado: "ok" });
    expect(busquedaSuscripcion({ resultado: "error" })).toEqual({ resultado: "error" });
    expect(busquedaSuscripcion({ resultado: "<script>" })).toEqual({});
    expect(busquedaSuscripcion({})).toEqual({});
    expect(mensajeResultado("ok")).toContain("inscrita");
  });

  it("solo deja salir del panel hacia Flow", () => {
    expect(esUrlDeFlow("https://www.flow.cl/app/customer/disclaimer.php?token=ABC")).toBe(true);
    expect(esUrlDeFlow("https://sandbox.flow.cl/app/customer/disclaimer.php?token=ABC")).toBe(true);
    expect(esUrlDeFlow("http://www.flow.cl/app")).toBe(false);
    expect(esUrlDeFlow("https://www.flow.cl.otro.com/app")).toBe(false);
    expect(esUrlDeFlow("javascript:alert(1)")).toBe(false);
    expect(esUrlDeFlow("no es url")).toBe(false);
  });

  it("formatea monto en pesos y fechas sin correrlas de zona", () => {
    expect(formatoMonto({ nombre: "Plan", monto: 200000, moneda: "CLP" })).toBe("$200.000");
    expect(formatoFecha("2026-12-13")).toBe("13-12-2026");
  });

  it("no agrega Suscripción al menú principal (va junto a Cambiar clave)", () => {
    expect(nav.some((i) => i.to === "/suscripcion")).toBe(false);
  });
});
