import { describe, expect, it } from "vitest";
import {
  credencialResponse,
  familiaResponse,
  numeroCamiseta,
  rutEntrada,
  hijoSolicitud,
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

  it("rut-lookup nunca devuelve ids; /familia no repite los links ya entregados", () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const apoderado = rutLookupResponse.parse({
      encontrado: true,
      tipo: "apoderado",
      id,
      ya_registrado: false,
      faltantes: [],
      hijos: [{ id, posicion: 0, primer_nombre: "Ana", ya_registrado: false, faltantes: [] }],
    });
    expect(JSON.stringify(apoderado)).not.toContain(id);

    const jugador = rutLookupResponse.parse({
      encontrado: true,
      tipo: "jugador",
      id,
      primer_nombre: "Ana",
      adulto: true,
      ya_registrado: false,
      faltantes: [],
    });
    expect(JSON.stringify(jugador)).not.toContain(id);

    const familia = familiaResponse.parse({
      estado_solicitud: "pendiente",
      personas: [],
      otros_apoderados: [{ nombre_completo: "Luis Soto", completar_token: "x", foto_subida: false }],
    });
    expect(Object.keys(familia.otros_apoderados[0] ?? {}).sort()).toEqual([
      "foto_subida",
      "nombre_completo",
    ]);
  });

  it("los hijos precargados se nombran por posición, no por id", () => {
    const ana = { precargado: 0, primer_nombre: "Ana" };
    expect(hijoSolicitud.safeParse({ ref: ana }).success).toBe(true);
    expect(hijoSolicitud.safeParse({ ref: { precargado: 0 } }).success).toBe(false);
    expect(hijoSolicitud.safeParse({ ref: { ...ana, precargado: -1 } }).success).toBe(false);
    const porId = { ref: { jugador_id: "00000000-0000-4000-8000-000000000000" } };
    expect(hijoSolicitud.safeParse(porId).success).toBe(false);
  });

  it("rechaza hijos repetidos e índices de otro apoderado fuera de rango", () => {
    const base = { rut: generarRutFicticio(3), tipo: "apoderado", consentimiento: true };
    const ana = { ref: { precargado: 0, primer_nombre: "Ana" } };
    const hijo = { ref: { rut: generarRutFicticio(4) } };
    const otro = { nombre: "Luis", apellido: "Soto", rut: generarRutFicticio(5), telefono: "912345678" };
    expect(solicitudDatos.safeParse({ ...base, hijos: [ana, hijo], otro_apoderado: { ...otro, hijos: [0, 1] } }).success).toBe(true);
    expect(solicitudDatos.safeParse({ ...base, hijos: [ana, ana] }).success).toBe(false);
    expect(solicitudDatos.safeParse({ ...base, hijos: [hijo, hijo] }).success).toBe(false);
    expect(solicitudDatos.safeParse({ ...base, hijos: [{ ref: { rut: base.rut } }] }).success).toBe(false);
    expect(solicitudDatos.safeParse({ ...base, hijos: [ana], otro_apoderado: { ...otro, hijos: [1] } }).success).toBe(false);
    expect(solicitudDatos.safeParse({ ...base, hijos: [ana], otro_apoderado: { ...otro, hijos: [0, 0] } }).success).toBe(false);
    expect(solicitudDatos.safeParse({ ...base, hijos: [ana], otro_apoderado: { ...otro, rut: base.rut, hijos: [0] } }).success).toBe(false);
  });

  it("arma la URL del QR", () => {
    expect(urlCredencial("https://panel.clubcolina.com/", "abc")).toBe(
      "https://panel.clubcolina.com/c/abc",
    );
  });
});
