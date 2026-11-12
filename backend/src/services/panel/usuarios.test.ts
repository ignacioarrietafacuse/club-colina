import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sesiones, usuarios } from "../../db/schema";
import { dbTest } from "../../test/db";
import { crearSesion, usuarioDeSesion, verificarCredenciales } from "./sesiones";
import { crearOActualizarUsuario } from "./usuarios";

const { db, cerrar } = dbTest();
afterAll(cerrar);

const nombreUnico = () => `script${Date.now()}${Math.floor(Math.random() * 1000)}`;

describe("crear usuario del panel", () => {
  it("guarda el usuario normalizado y la contraseña en argon2id", async () => {
    const usuario = nombreUnico();
    const password = "clave-de-prueba-123";
    expect(await crearOActualizarUsuario(db, { usuario: ` ${usuario.toUpperCase()} `, nombre: " Mony ", password })).toBe(
      "creado",
    );
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.usuario, usuario));
    expect(fila?.nombre).toBe("Mony");
    expect(fila?.password_hash.startsWith("$argon2id$")).toBe(true);
    expect(fila?.password_hash).not.toContain(password);
    expect(await verificarCredenciales(db, usuario, password)).toEqual({ id: fila?.id, nombre: "Mony" });
  });

  it("no pisa un usuario existente sin --cambiar, y no crea con --cambiar", async () => {
    const usuario = nombreUnico();
    const datos = { usuario, nombre: "Uno", password: "clave-de-prueba-123" };
    await crearOActualizarUsuario(db, datos);
    await expect(crearOActualizarUsuario(db, datos)).rejects.toThrow(/ya existe/);
    await expect(crearOActualizarUsuario(db, { ...datos, usuario: nombreUnico() }, { cambiar: true })).rejects.toThrow(
      /no existe/,
    );
  });

  it("--cambiar pone la contraseña nueva, reactiva y cierra las sesiones abiertas", async () => {
    const usuario = nombreUnico();
    await crearOActualizarUsuario(db, { usuario, nombre: "Uno", password: "clave-vieja-1234" });
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.usuario, usuario));
    if (!fila) throw new Error("sin fila");
    const { token } = await crearSesion(db, fila.id);
    await db.update(usuarios).set({ activo: false }).where(eq(usuarios.id, fila.id));
    expect(
      await crearOActualizarUsuario(db, { usuario, nombre: "Uno", password: "clave-nueva-1234" }, { cambiar: true }),
    ).toBe("actualizado");
    expect(await usuarioDeSesion(db, token)).toBeNull();
    expect(await db.select().from(sesiones).where(eq(sesiones.usuario_id, fila.id))).toHaveLength(0);
    expect(await verificarCredenciales(db, usuario, "clave-vieja-1234")).toBeNull();
    expect(await verificarCredenciales(db, usuario, "clave-nueva-1234")).not.toBeNull();
  });

  it("rechaza contraseñas cortas y usuarios raros sin repetir la contraseña", async () => {
    const corta = "corta";
    await expect(crearOActualizarUsuario(db, { usuario: nombreUnico(), nombre: "X", password: corta })).rejects.toThrow(
      /entre 12 y 200/,
    );
    await expect(
      crearOActualizarUsuario(db, { usuario: "a b", nombre: "X", password: "clave-de-prueba-123" }),
    ).rejects.toThrow(/usuario/);
    await expect(
      crearOActualizarUsuario(db, { usuario: nombreUnico(), nombre: "  ", password: "clave-de-prueba-123" }),
    ).rejects.toThrow(/nombre/);
  });
});
