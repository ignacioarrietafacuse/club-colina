import { describe, expect, it } from "vitest";
import { basePublicaParaVite, normalizarBasePublica } from "./base-publica";
import { urlQrCredencial } from "./credencial";

const TOKEN = "c".repeat(43);

describe("dirección pública del QR", () => {
  it.each([
    ["https://club-colina.vercel.app", "https://club-colina.vercel.app"],
    ["https://club-colina.vercel.app/", "https://club-colina.vercel.app"],
    [" https://panel.clubcolina.cl ", "https://panel.clubcolina.cl"],
    ["http://localhost:5173", "http://localhost:5173"],
  ])("acepta %s", (valor, esperado) => {
    expect(normalizarBasePublica(valor)).toBe(esperado);
  });

  it.each([
    [undefined],
    [""],
    ["club-colina.vercel.app"],
    ["http://club-colina.vercel.app"],
    ["https://club-colina.vercel.app/panel"],
    ["https://club-colina.vercel.app/?x=1"],
    ["https://usuario:clave@club-colina.vercel.app"],
    ["javascript:alert(1)"],
  ])("rechaza %s", (valor) => {
    expect(normalizarBasePublica(valor)).toBeNull();
  });

  it("un build sin la variable falla", () => {
    expect(() => basePublicaParaVite(undefined, true)).toThrow(/no está definida/);
    expect(() => basePublicaParaVite("http://club-colina.vercel.app", true)).toThrow(
      /no es válida/,
    );
  });

  it("el servidor de desarrollo sin variable usa localhost; con una inválida, falla igual", () => {
    expect(basePublicaParaVite(undefined, false)).toBe("http://localhost:5173");
    expect(() => basePublicaParaVite("ftp://x", false)).toThrow();
  });

  it("arma la URL de la credencial con la base, no con el navegador", () => {
    expect(urlQrCredencial(TOKEN, "https://panel.clubcolina.cl/")).toBe(
      `https://panel.clubcolina.cl/c/${TOKEN}`,
    );
  });

  it("sin base válida no arma ninguna URL", () => {
    expect(() => urlQrCredencial(TOKEN, "")).toThrow();
  });
});
