import { describe, expect, it } from "vitest";
import {
  credencialResponse,
  familiaResponse,
  numeroCamiseta,
  rutEntrada,
  rutLookupResponse,
  solicitudDatos,
  telefonoEntrada,
  urlCredencial,
} from "./contrato";
import { generarRutFicticio } from "./rut";

describe("contrato", () => {
  it("normaliza RUT y teléfono de entrada", () => {
    const rut = generarRutFicticio(1);
    expect(rutEntrada.parse(rut.replace("-", ""))).toBe(rut);
    expect(rutEntrada.safeParse("12345678-9").success).toBe(false);
    expect(telefonoEntrada.parse("+56 9 1234 5678")).toBe("912345678");
    expect(telefonoEntrada.safeParse("1234").success).toBe(false);
  });

  it("distingue 0 de 00 en el número de camiseta", () => {
    expect(numeroCamiseta.parse("00")).toBe("00");
    expect(numeroCamiseta.parse("0")).toBe("0");
    expect(numeroCamiseta.safeParse("100").success).toBe(false);
    expect(numeroCamiseta.safeParse("7a").success).toBe(false);
  });

  it("exige consentimiento en la solicitud", () => {
    const base = { rut: generarRutFicticio(2), tipo: "apoderado" };
    expect(solicitudDatos.safeParse(base).success).toBe(false);
    const ok = solicitudDatos.parse({ ...base, consentimiento: true });
    expect(ok.hijos).toEqual([]);
  });

  // Las respuestas públicas no tienen campos para RUT, teléfono, correo ni fechas:
  // si alguien los agrega por error, z.object los descarta y este test lo detecta.
  it("las respuestas públicas descartan datos personales", () => {
    const sensibles = { rut: "x", telefono: "x", email: "x", fecha_nacimiento: "x" };
    const credencial = credencialResponse.parse({
      nombre_completo: "Ana Pérez",
      rol: "jugador",
      ...sensibles,
    });
    expect(Object.keys(credencial).sort()).toEqual(["nombre_completo", "rol"]);

    const lookup = rutLookupResponse.parse({ encontrado: false, ...sensibles });
    expect(Object.keys(lookup)).toEqual(["encontrado"]);

    const familia = familiaResponse.parse({
      estado_solicitud: "pendiente",
      personas: [{ nombre_completo: "Ana Pérez", rol: "jugador", estado: "pendiente", ...sensibles }],
      otros_apoderados: [],
    });
    expect(Object.keys(familia.personas[0] ?? {}).sort()).toEqual([
      "estado",
      "nombre_completo",
      "rol",
    ]);
  });

  it("arma la URL del QR", () => {
    expect(urlCredencial("https://panel.clubcolina.cl/", "abc")).toBe(
      "https://panel.clubcolina.cl/c/abc",
    );
  });
});
