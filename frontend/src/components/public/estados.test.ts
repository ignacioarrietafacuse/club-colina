import { describe, expect, it } from "vitest";
import { ErrorApi } from "@/lib/api";
import {
  esNoEncontrado,
  estadoDesdeConsulta,
  tituloCompletar,
  tokenConForma,
  VIGENCIA_VERIFICACION_MS,
} from "./estados";

describe("tokenConForma", () => {
  it("43 caracteres base64url", () => {
    expect(tokenConForma("A".repeat(43))).toBe(true);
    expect(tokenConForma("A".repeat(42))).toBe(false);
    expect(tokenConForma(`${"A".repeat(42)}/`)).toBe(false);
  });
});

describe("esNoEncontrado", () => {
  it("solo el 404 es «no válida»; otro 4xx (un proxy, por ejemplo) se puede reintentar", () => {
    expect(esNoEncontrado(new ErrorApi(404, "no_encontrado", "x"))).toBe(true);
    expect(esNoEncontrado(new ErrorApi(400, "validacion", "x"))).toBe(false);
    expect(esNoEncontrado(new ErrorApi(403, "error_interno", "x"))).toBe(false);
  });

  it("sin red, 429, 5xx o un error cualquiera: no se pudo verificar", () => {
    expect(esNoEncontrado(new ErrorApi(0, "sin_conexion", "x"))).toBe(false);
    expect(esNoEncontrado(new ErrorApi(429, "demasiados_intentos", "x"))).toBe(false);
    expect(esNoEncontrado(new ErrorApi(500, "error_interno", "x"))).toBe(false);
    expect(esNoEncontrado(new Error("x"))).toBe(false);
  });
});

describe("estadoDesdeConsulta", () => {
  const T0 = 1_800_000_000_000;
  const base = {
    conForma: true,
    pendiente: false,
    enCurso: false,
    error: null,
    datos: { nombre_completo: "Ana Pérez", rol: "jugador" as const },
    actualizadaEn: T0,
    ahora: T0 + 1_000,
    fotoUrl: "/api/public/credencial/x/foto",
  };

  it("válida solo con una respuesta reciente y sin otra consulta en curso", () => {
    expect(estadoDesdeConsulta(base).tipo).toBe("valida");
    // Volvió a la pestaña: mientras se pregunta de nuevo, los datos viejos no se muestran en verde.
    expect(estadoDesdeConsulta({ ...base, enCurso: true }).tipo).toBe("cargando");
    expect(estadoDesdeConsulta({ ...base, ahora: T0 + VIGENCIA_VERIFICACION_MS + 1 }).tipo).toBe(
      "vencida",
    );
  });

  it("un error gana sobre los datos viejos", () => {
    expect(estadoDesdeConsulta({ ...base, error: "no_encontrado" }).tipo).toBe("no_valida");
    expect(estadoDesdeConsulta({ ...base, error: "otro" }).tipo).toBe("error");
    expect(estadoDesdeConsulta({ ...base, error: "demasiados_intentos" }).tipo).toBe(
      "demasiados_intentos",
    );
  });

  it("token sin forma: no válida aunque hubiera datos", () => {
    expect(estadoDesdeConsulta({ ...base, conForma: false }).tipo).toBe("no_valida");
  });

  it("sin datos todavía: cargando", () => {
    expect(estadoDesdeConsulta({ ...base, pendiente: true, datos: undefined }).tipo).toBe(
      "cargando",
    );
  });
});

describe("tituloCompletar", () => {
  it("según el paso del segundo apoderado", () => {
    expect(tituloCompletar(undefined)).toBe("Sube tu foto");
    expect(tituloCompletar({ primer_nombre: "Eva", foto_subida: false })).toBe("Sube tu foto");
    expect(tituloCompletar({ primer_nombre: "Eva", foto_subida: true })).toBe("Tu registro");
    expect(
      tituloCompletar({
        primer_nombre: "Eva",
        foto_subida: false,
        credencial_token: "T".repeat(43),
      }),
    ).toBe("Tu credencial");
  });
});
