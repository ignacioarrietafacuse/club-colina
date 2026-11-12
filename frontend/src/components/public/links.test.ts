import { afterEach, describe, expect, it, vi } from "vitest";
import { hayBasePublica, urlPublica } from "./links";

const TOKEN = "A".repeat(43);

afterEach(() => vi.unstubAllGlobals());

describe("urlPublica", () => {
  it("sin argumento usa VITE_PUBLIC_BASE_URL, no la dirección del navegador", () => {
    vi.stubGlobal("window", { location: { origin: "https://vista-previa.vercel.app" } });
    expect(urlPublica(`/familia/${TOKEN}`)).toBe(`https://club-colina.test/familia/${TOKEN}`);
  });

  it("normaliza la dirección", () => {
    expect(urlPublica("/completar/x", "https://panel.example/")).toBe(
      "https://panel.example/completar/x",
    );
  });

  it("una dirección que no sirve da null", () => {
    expect(urlPublica("/x", "")).toBeNull();
    expect(urlPublica("/x", "http://otro.example")).toBeNull();
    expect(urlPublica("/x", "https://otro.example/ruta")).toBeNull();
  });
});

describe("hayBasePublica", () => {
  it("dice si se pueden armar los links antes de enviar", () => {
    expect(hayBasePublica()).toBe(true);
    expect(hayBasePublica("")).toBe(false);
  });
});
