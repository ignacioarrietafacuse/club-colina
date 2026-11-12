import { describe, expect, it } from "vitest";
import { ErrorApi } from "@/lib/api";
import { mensajeCambiarClave, problemaClave } from "./clave";

describe("cambiar clave", () => {
  const NUEVA = "una-clave-nueva-larga";

  it("pide la actual, 12 caracteres, distinta de la actual y repetida igual", () => {
    expect(problemaClave("", NUEVA, NUEVA)).toMatch(/actual/);
    expect(problemaClave("vieja", "a".repeat(11), "a".repeat(11))).toMatch(/12/);
    expect(problemaClave(NUEVA, NUEVA, NUEVA)).toMatch(/distinta/);
    expect(problemaClave("vieja", NUEVA, `${NUEVA}x`)).toMatch(/no coinciden/);
    expect(problemaClave("vieja", NUEVA, NUEVA)).toBeNull();
  });

  it("explica cada error del servidor", () => {
    expect(mensajeCambiarClave(new ErrorApi(400, "credenciales_invalidas", "x"))).toBe(
      "La clave actual no es correcta.",
    );
    expect(mensajeCambiarClave(new ErrorApi(429, "demasiados_intentos", "x"))).toMatch(
      /Demasiados intentos/,
    );
    expect(mensajeCambiarClave(new Error("x"))).toMatch(/No se pudo cambiar/);
  });
});
