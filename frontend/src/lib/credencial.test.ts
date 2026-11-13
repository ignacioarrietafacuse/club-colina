import { describe, expect, it } from "vitest";
import { basePublicaParaVite, normalizarBasePublica } from "./base-publica";
import { urlQrCredencial } from "./credencial";

const TOKEN = "c".repeat(43);

describe("dirección pública del QR", () => {
  it.each([
    ["https://club-colina.vercel.app", "https://club-colina.vercel.app"],
    ["https://club-colina.vercel.app/", "https://club-colina.vercel.app"],
    [" https://panel.clubcolina.com ", "https://panel.clubcolina.com"],
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
    expect(() => basePublicaParaVite(undefined, { esBuild: true })).toThrow(/no está definida/);
    expect(() => basePublicaParaVite("http://club-colina.vercel.app", { esBuild: true })).toThrow(
      /no es válida/,
    );
  });

  it("el build que se publica (Vercel) no acepta localhost", () => {
    expect(() =>
      basePublicaParaVite("http://localhost:5173", { esBuild: true, exigirPublica: true }),
    ).toThrow(/no localhost/);
    expect(
      basePublicaParaVite("https://club-colina.vercel.app", { esBuild: true, exigirPublica: true }),
    ).toBe("https://club-colina.vercel.app");
    // Un build local (pnpm check) sí lo acepta.
    expect(basePublicaParaVite("http://localhost:5173", { esBuild: true })).toBe(
      "http://localhost:5173",
    );
  });

  it("el servidor de desarrollo sin variable usa localhost; con una inválida, falla igual", () => {
    expect(basePublicaParaVite(undefined, { esBuild: false })).toBe("http://localhost:5173");
    expect(() => basePublicaParaVite("ftp://x", { esBuild: false })).toThrow();
  });

  it("en los tests la variable tiene un valor ficticio (vitest.config.ts)", () => {
    expect(urlQrCredencial(TOKEN)).toBe(`https://club-colina.test/c/${TOKEN}`);
  });

  it("arma la URL de la credencial con la base, no con el navegador", () => {
    expect(urlQrCredencial(TOKEN, "https://panel.clubcolina.com/")).toBe(
      `https://panel.clubcolina.com/c/${TOKEN}`,
    );
  });

  it("sin base válida no arma ninguna URL", () => {
    expect(() => urlQrCredencial(TOKEN, "")).toThrow();
  });
});
