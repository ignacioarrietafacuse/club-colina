import QRCode from "qrcode";
import { describe, expect, it, vi } from "vitest";
import { nombreArchivoQr, qrCredencial, urlPublica } from "./qr";

const TOKEN = "A".repeat(43);

describe("qrCredencial", () => {
  it("graba /c/:token con la dirección pública fijada al compilar, no la del navegador", async () => {
    const espia = vi.spyOn(QRCode, "toDataURL");
    const png = await qrCredencial(TOKEN);
    expect(png.startsWith("data:image/png;base64,")).toBe(true);
    // vitest.config.ts fija VITE_PUBLIC_BASE_URL=https://club-colina.test
    expect(espia.mock.calls[0]?.[0]).toBe(`https://club-colina.test/c/${TOKEN}`);
  });

  it("sin dirección pública válida no dibuja nada", async () => {
    await expect(async () => qrCredencial(TOKEN, "")).rejects.toThrow(/VITE_PUBLIC_BASE_URL/);
  });
});

describe("urlPublica", () => {
  it("usa la dirección pública y la normaliza", () => {
    expect(urlPublica(`/familia/${TOKEN}`)).toBe(`https://club-colina.test/familia/${TOKEN}`);
    expect(urlPublica("/completar/x", "https://panel.example/")).toBe(
      "https://panel.example/completar/x",
    );
  });

  it("rechaza una dirección que no sirve", () => {
    expect(() => urlPublica("/x", "http://otro.example")).toThrow(/VITE_PUBLIC_BASE_URL/);
    expect(() => urlPublica("/x", undefined)).not.toThrow();
  });
});

describe("nombreArchivoQr", () => {
  it("sin tildes ni espacios", () => {
    expect(nombreArchivoQr("María José Núñez")).toBe("credencial-maria-jose-nunez.png");
    expect(nombreArchivoQr("  ")).toBe("credencial-club-colina.png");
  });
});
