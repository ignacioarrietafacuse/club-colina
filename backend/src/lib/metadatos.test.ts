import { describe, expect, it } from "vitest";
import { JPEG_PRUEBA, PNG_PRUEBA, WEBP_PRUEBA } from "../test/db";
import { quitarMetadatos } from "./fotos";

const GPS = Buffer.from("GPSLatitude -33.2000 GPSLongitude -70.6700 casa");

function segmentoJpeg(marcador: number, datos: Buffer) {
  const cab = Buffer.from([0xff, marcador, 0, 0]);
  cab.writeUInt16BE(datos.length + 2, 2);
  return Buffer.concat([cab, datos]);
}

function chunkPng(tipo: string, datos: Buffer) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  return Buffer.concat([largo, Buffer.from(tipo, "latin1"), datos, Buffer.alloc(4)]);
}

function chunkWebp(tipo: string, datos: Buffer) {
  const cab = Buffer.alloc(8);
  cab.write(tipo, 0, "latin1");
  cab.writeUInt32LE(datos.length, 4);
  return Buffer.concat([cab, datos, datos.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

describe("quitar metadatos", () => {
  it("JPEG: borra EXIF (APP1), XMP y comentarios, y conserva la imagen", () => {
    const exif = segmentoJpeg(0xe1, Buffer.concat([Buffer.from("Exif\0\0"), GPS]));
    const comentario = segmentoJpeg(0xfe, GPS);
    const conExif = Buffer.concat([JPEG_PRUEBA.subarray(0, 2), exif, comentario, JPEG_PRUEBA.subarray(2)]);
    const limpia = quitarMetadatos(conExif, "image/jpeg");
    expect(limpia).not.toBeNull();
    expect(limpia?.includes(GPS)).toBe(false);
    expect(limpia?.equals(JPEG_PRUEBA)).toBe(true);
  });

  it("PNG: borra tEXt, iTXt y eXIf", () => {
    const ihdrFin = 8 + 25;
    const conTexto = Buffer.concat([
      PNG_PRUEBA.subarray(0, ihdrFin),
      chunkPng("tEXt", GPS),
      chunkPng("eXIf", GPS),
      PNG_PRUEBA.subarray(ihdrFin),
    ]);
    const limpia = quitarMetadatos(conTexto, "image/png");
    expect(limpia?.includes(GPS)).toBe(false);
    expect(limpia?.equals(PNG_PRUEBA)).toBe(true);
  });

  it("WebP: borra EXIF y XMP, apaga sus marcas y corrige el tamaño", () => {
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x0c;
    const cuerpo = Buffer.concat([
      chunkWebp("VP8X", vp8x),
      WEBP_PRUEBA.subarray(12),
      chunkWebp("EXIF", GPS),
      chunkWebp("XMP ", GPS),
    ]);
    const cab = Buffer.from("RIFF0000WEBP", "latin1");
    cab.writeUInt32LE(cuerpo.length + 4, 4);
    const limpia = quitarMetadatos(Buffer.concat([cab, cuerpo]), "image/webp");
    expect(limpia).not.toBeNull();
    expect(limpia?.includes(GPS)).toBe(false);
    expect(limpia?.readUInt32LE(4)).toBe((limpia?.length ?? 0) - 8);
    expect(limpia?.[20]).toBe(0);
    expect(quitarMetadatos(WEBP_PRUEBA, "image/webp")?.equals(WEBP_PRUEBA)).toBe(true);
  });

  it("rechaza estructuras dañadas", () => {
    expect(quitarMetadatos(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), "image/jpeg")).toBeNull();
    expect(quitarMetadatos(PNG_PRUEBA.subarray(0, 20), "image/png")).toBeNull();
  });
});
