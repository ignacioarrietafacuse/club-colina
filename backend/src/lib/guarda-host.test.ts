import { describe, expect, it, vi } from "vitest";
import { verificarHostDestino } from "./guarda-host";

describe("guarda de host", () => {
  it("deja pasar localhost sin opciones", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(verificarHostDestino(`postgres://u@${host}:5432/db`, []).produccion).toBe(false);
    }
  });

  it("se niega a escribir en otro host sin --produccion", () => {
    expect(() => verificarHostDestino("postgres://u:p@db.ejemplo.net:5432/db", [])).toThrow(
      /--produccion/,
    );
  });

  it("con --produccion avisa el host y no muestra la contraseña", () => {
    const avisar = vi.fn();
    const r = verificarHostDestino("postgres://u:secreta@db.ejemplo.net/db", ["--produccion"], avisar);
    expect(r).toEqual({ host: "db.ejemplo.net", produccion: true });
    expect(avisar).toHaveBeenCalledOnce();
    expect(String(avisar.mock.calls[0]?.[0])).toContain("db.ejemplo.net");
    expect(String(avisar.mock.calls[0]?.[0])).not.toContain("secreta");
  });

  it("rechaza URLs inválidas", () => {
    expect(() => verificarHostDestino("no es url", [])).toThrow();
  });
});
