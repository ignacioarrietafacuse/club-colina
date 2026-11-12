import { FOTO_MAX_BYTES } from "@club-colina/shared";
import { describe, expect, it, vi } from "vitest";
import { calcularDimensiones, comprimirFoto, ErrorFoto, type Lienzo } from "./foto";

describe("calcularDimensiones", () => {
  it("deja el lado mayor en 1024 y conserva la proporción", () => {
    expect(calcularDimensiones(4032, 3024)).toEqual({ ancho: 1024, alto: 768 });
    expect(calcularDimensiones(3024, 4032)).toEqual({ ancho: 768, alto: 1024 });
  });

  it("no agranda una foto chica", () => {
    expect(calcularDimensiones(640, 480)).toEqual({ ancho: 640, alto: 480 });
  });

  it("rechaza una imagen sin tamaño", () => {
    expect(() => calcularDimensiones(0, 10)).toThrow(ErrorFoto);
  });
});

function lienzoFalso(tamanos: number[]): Lienzo & { calidades: number[]; liberada: boolean } {
  const l = {
    calidades: [] as number[],
    liberada: false,
    decodificar: async () => ({
      ancho: 2000,
      alto: 1000,
      fuente: {} as CanvasImageSource,
      liberar: () => {
        l.liberada = true;
      },
    }),
    exportar: vi.fn(async (_f: CanvasImageSource, ancho: number, alto: number, calidad: number) => {
      expect({ ancho, alto }).toEqual({ ancho: 1024, alto: 512 });
      l.calidades.push(calidad);
      return new Blob([new Uint8Array(tamanos[l.calidades.length - 1] ?? 0)], {
        type: "image/jpeg",
      });
    }),
  };
  return l;
}

const imagen = new Blob([new Uint8Array(10)], { type: "image/heic" });

describe("comprimirFoto", () => {
  it("exporta JPEG al 80 % y libera la imagen", async () => {
    const l = lienzoFalso([1000]);
    const archivo = await comprimirFoto(imagen, l);
    expect(archivo.type).toBe("image/jpeg");
    expect(archivo.name).toBe("foto.jpg");
    expect(l.calidades).toEqual([0.8]);
    expect(l.liberada).toBe(true);
  });

  it("baja la calidad si pasa del límite, y si nunca entra falla con un mensaje claro", async () => {
    const l = lienzoFalso([FOTO_MAX_BYTES + 1, 500]);
    await comprimirFoto(imagen, l);
    expect(l.calidades).toEqual([0.8, 0.7]);

    const grande = lienzoFalso([1, 1, 1, 1].map(() => FOTO_MAX_BYTES + 1));
    await expect(comprimirFoto(imagen, grande)).rejects.toThrow(/pesada/);
    expect(grande.liberada).toBe(true);
  });

  it("rechaza lo que no es imagen y lo que no se puede leer", async () => {
    await expect(
      comprimirFoto(new Blob(["x"], { type: "application/pdf" }), lienzoFalso([])),
    ).rejects.toThrow(/no es una foto/);
    const roto: Lienzo = { decodificar: () => Promise.reject(new Error("x")), exportar: vi.fn() };
    await expect(comprimirFoto(imagen, roto)).rejects.toThrow(/No pudimos leer/);
  });
});
