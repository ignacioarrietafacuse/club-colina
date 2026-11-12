import { afterAll, describe, expect, it } from "vitest";
import { FOTO_MAX_BYTES } from "@club-colina/shared";
import { dbTest, JPEG_PRUEBA } from "../test/db";
import { borrarFoto, detectarMime, guardarFoto, leerFoto } from "./fotos";

const { db, cerrar } = dbTest();
afterAll(cerrar);

describe("fotos", () => {
  it("detecta el tipo por los bytes", () => {
    expect(detectarMime(JPEG_PRUEBA)).toBe("image/jpeg");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    expect(detectarMime(png)).toBe("image/png");
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
    expect(detectarMime(webp)).toBe("image/webp");
    expect(detectarMime(Buffer.from("<svg></svg>"))).toBeNull();
    expect(detectarMime(Buffer.from("%PDF-1.7"))).toBeNull();
  });

  it("guarda, lee y borra", async () => {
    const id = await guardarFoto(db, JPEG_PRUEBA);
    const foto = await leerFoto(db, id);
    expect(foto?.mime).toBe("image/jpeg");
    expect(foto?.bytes.equals(JPEG_PRUEBA)).toBe(true);
    expect(await borrarFoto(db, id)).toBe(true);
    expect(await leerFoto(db, id)).toBeNull();
    expect(await borrarFoto(db, id)).toBe(false);
  });

  it("rechaza vacías, demasiado grandes y lo que no es imagen", async () => {
    await expect(guardarFoto(db, Buffer.alloc(0))).rejects.toMatchObject({ codigo: "archivo_invalido" });
    const grande = Buffer.concat([JPEG_PRUEBA, Buffer.alloc(FOTO_MAX_BYTES)]);
    await expect(guardarFoto(db, grande)).rejects.toMatchObject({ status: 413 });
    await expect(guardarFoto(db, Buffer.from("<svg/>"))).rejects.toMatchObject({ status: 400 });
  });
});
