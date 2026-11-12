import QRCode from "qrcode";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nombreArchivoQr, qrCredencial } from "./qr";

const TOKEN = "A".repeat(43);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("qrCredencial", () => {
  it("graba /c/:token con la dirección pública fijada al compilar, aunque el navegador esté en otra", async () => {
    vi.stubGlobal("window", { location: { origin: "https://vista-previa.vercel.app" } });
    const espia = vi.spyOn(QRCode, "toDataURL");
    const png = await qrCredencial(TOKEN);
    expect(png.startsWith("data:image/png;base64,")).toBe(true);
    // vitest.config.ts fija VITE_PUBLIC_BASE_URL=https://club-colina.test
    expect(espia.mock.calls[0]?.[0]).toBe(`https://club-colina.test/c/${TOKEN}`);
  });

  it("sin dirección pública válida devuelve una promesa rechazada, no un error en el acto", async () => {
    let promesa: Promise<string> | undefined;
    expect(() => {
      promesa = qrCredencial(TOKEN, "");
    }).not.toThrow();
    await expect(promesa).rejects.toThrow(/VITE_PUBLIC_BASE_URL/);
  });
});

describe("nombreArchivoQr", () => {
  it("sin tildes ni espacios", () => {
    expect(nombreArchivoQr("María José Núñez")).toBe("credencial-maria-jose-nunez.png");
    expect(nombreArchivoQr("  ")).toBe("credencial-club-colina.png");
  });
});
