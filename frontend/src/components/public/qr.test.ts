import QRCode from "qrcode";
import { describe, expect, it, vi } from "vitest";
import { nombreArchivoQr, qrCredencial } from "./qr";

describe("qrCredencial", () => {
  it("graba la URL de /c/:token y devuelve un PNG", async () => {
    const espia = vi.spyOn(QRCode, "toDataURL");
    const token = "A".repeat(43);
    const png = await qrCredencial("https://club.example/", token);
    expect(png.startsWith("data:image/png;base64,")).toBe(true);
    expect(espia.mock.calls[0]?.[0]).toBe(`https://club.example/c/${token}`);
  });
});

describe("nombreArchivoQr", () => {
  it("sin tildes ni espacios", () => {
    expect(nombreArchivoQr("María José Núñez")).toBe("credencial-maria-jose-nunez.png");
    expect(nombreArchivoQr("  ")).toBe("credencial-club-colina.png");
  });
});
