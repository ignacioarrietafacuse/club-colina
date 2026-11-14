import { inscribirTarjetaResponse, suscripcionResponse } from "@club-colina/shared";
import { describe, expect, it } from "vitest";
import { nav } from "@/components/panel/navegacion";
import {
  busquedaSuscripcion,
  esUrlDeFlow,
  formatoFecha,
  formatoMonto,
  formatoPeriodo,
  mensajeResultado,
  mostrarAviso,
  periodoActual,
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

describe("aviso de resultado", () => {
  it("'Listo' y 'recuperada' solo encima de una suscripción viva; nunca mientras carga", () => {
    for (const r of ["ok", "recuperada"] as const) {
      expect(mostrarAviso(r, "activa")).toBe(true);
      expect(mostrarAviso(r, "cobro_fallido")).toBe(true);
      expect(mostrarAviso(r, "sin_tarjeta")).toBe(false);
      expect(mostrarAviso(r, "no_disponible")).toBe(false);
      expect(mostrarAviso(r, "pendiente_configuracion")).toBe(false);
      expect(mostrarAviso(r, undefined)).toBe(false);
    }
    expect(mensajeResultado("recuperada")).toContain("No se hizo ningún cobro nuevo");
    expect(mensajeResultado("ok", "activa")).toContain("El cargo es automático");
    expect(mensajeResultado("ok", "cobro_fallido")).toContain("El cobro pendiente sigue abajo");
  });

  it("el error de inscripción se muestra con sin tarjeta o con una suscripción viva", () => {
    expect(mostrarAviso("error", "sin_tarjeta")).toBe(true);
    expect(mostrarAviso("error", "activa")).toBe(true);
    expect(mostrarAviso("error", "no_disponible")).toBe(false);
    expect(mostrarAviso("error", undefined)).toBe(false);
    expect(mostrarAviso(undefined, "activa")).toBe(false);
    // Encima de una suscripción viva, el error habla del cambio de tarjeta, no de "inscribir".
    expect(mensajeResultado("error", "activa")).toContain("La suscripción sigue");
    expect(mensajeResultado("error", "cobro_fallido")).toContain("La suscripción sigue");
    expect(mensajeResultado("error", "sin_tarjeta")).toContain("No se pudo inscribir");
  });

  it("entiende la respuesta de inscribir del backend anterior (solo url) y rechaza flow sin url", () => {
    const url = "https://sandbox.flow.cl/app/customer/disclaimer.php?token=ABC";
    expect(inscribirTarjetaResponse.parse({ url })).toEqual({ resultado: "flow", url });
    expect(inscribirTarjetaResponse.parse({ resultado: "recuperada" })).toEqual({
      resultado: "recuperada",
    });
    expect(inscribirTarjetaResponse.safeParse({ resultado: "flow" }).success).toBe(false);
    expect(inscribirTarjetaResponse.safeParse({}).success).toBe(false);
  });
});

describe("período de cada cobro", () => {
  it("formatea el período de Flow tal cual: 13-11-2026 al 12-12-2026", () => {
    expect(formatoPeriodo({ desde: "2026-11-13", hasta: "2026-12-12" })).toBe(
      "13-11-2026 al 12-12-2026",
    );
    expect(formatoPeriodo({ desde: "2026-12-31", hasta: "2027-01-30" })).toBe(
      "31-12-2026 al 30-01-2027",
    );
    expect(formatoPeriodo(null)).toBe("—");
    expect(formatoPeriodo(undefined)).toBe("—");
  });

  it("el período actual es el del último cobro pagado, saltando pendientes, fallidos y sin período", () => {
    const pagadoNov = {
      fecha: "2026-11-13",
      monto: 200000,
      estado: "pagado" as const,
      periodo: { desde: "2026-11-13", hasta: "2026-12-12" },
    };
    const fallidoDic = {
      fecha: "2026-12-13",
      monto: 200000,
      estado: "fallido" as const,
      periodo: { desde: "2026-12-13", hasta: "2027-01-12" },
    };
    const pagadoSinPeriodo = {
      fecha: "2026-12-14",
      monto: 200000,
      estado: "pagado" as const,
      periodo: null,
    };
    expect(periodoActual([pagadoSinPeriodo, fallidoDic, pagadoNov])).toEqual(pagadoNov.periodo);
    expect(periodoActual([fallidoDic])).toBeNull();
    expect(periodoActual([])).toBeNull();
  });
});

describe("contrato del historial", () => {
  it("acepta cobros sin periodo (backend anterior)", () => {
    const r = suscripcionResponse.safeParse({
      estado: "activa",
      modo: "sandbox",
      tiene_cliente: true,
      puede_reintentar: false,
      plan: { nombre: "Plan", monto: 200000, moneda: "CLP" },
      proximo_cobro: "2026-12-13",
      tarjeta: null,
      historial: [{ fecha: "2026-11-13", monto: 200000, estado: "pagado" }],
    });
    expect(r.success).toBe(true);
  });
});
