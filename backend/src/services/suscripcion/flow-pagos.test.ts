import { describe, expect, it } from "vitest";
import { configuracionRechazada } from "./flow-pagos";

// Las respuestas reales de Flow, vistas el 2026-11-14 (sin claves ni datos).
describe("configuracionRechazada", () => {
  it("reconoce las claves y el plan rechazados con la forma real de Flow", () => {
    expect(configuracionRechazada("plans/get", 109, "Invalid ApiKey")).toBe("apiKey");
    expect(configuracionRechazada("plans/get", 108, "Invalid Signature")).toBe("firma");
    // Producción con una apiKey que no conoce (la de sandbox).
    expect(configuracionRechazada("plans/get", 501, "Internal Server Error - apiKey not found")).toBe("apiKey");
    expect(configuracionRechazada("customer/create", 501, "Internal Server Error - apiKey not found")).toBe("apiKey");
    expect(
      configuracionRechazada("plans/get", 501, "Internal Server Error - the plan suscripcion_clubcolina was not found"),
    ).toBe("plan");
  });

  it("el resto no es configuración: externalId repetido, caídas, otros servicios", () => {
    expect(configuracionRechazada("customer/create", 501, "Internal Server Error - externalId already exists")).toBeUndefined();
    expect(configuracionRechazada("customer/create", 501, undefined)).toBeUndefined();
    expect(configuracionRechazada("plans/get", 500, "error")).toBeUndefined();
    expect(configuracionRechazada("plans/get", undefined, undefined)).toBeUndefined();
    // "not found" de otra cosa en otro servicio no es el plan.
    expect(configuracionRechazada("customer/get", 501, "Internal Server Error - the plan x was not found")).toBeUndefined();
  });
});
