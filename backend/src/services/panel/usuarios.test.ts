import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { crearDb } from "../../db/cliente";
import { sesiones, usuarios } from "../../db/schema";
import { dbTest, urlTest } from "../../test/db";
import { crearSesion, usuarioDeSesion, verificarCredenciales } from "./sesiones";
import { cambiarPassword, crearUsuario, mensajeParaMostrar } from "./usuarios";

const { db, cerrar } = dbTest();
afterAll(cerrar);

const nombreUnico = () => `script${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function mensajeDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
  } catch (error) {
    return mensajeParaMostrar(error);
  }
  throw new Error("no falló");
}

describe("usuarios del panel (script crear-usuario)", () => {
  it("guarda el usuario normalizado y la contraseña en argon2id", async () => {
    const usuario = nombreUnico();
    const password = "clave-de-prueba-123";
    await crearUsuario(db, { usuario: ` ${usuario.toUpperCase()} `, nombre: " Mony ", password });
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.usuario, usuario));
    expect(fila?.nombre).toBe("Mony");
    expect(fila?.password_hash.startsWith("$argon2id$")).toBe(true);
    expect(fila?.password_hash).not.toContain(password);
    expect(await verificarCredenciales(db, usuario, password)).toEqual({ id: fila?.id, nombre: "Mony", debe_cambiar_clave: false });
  });

  it("no crea un usuario que ya existe, ni cambia la contraseña de uno que no existe", async () => {
    const usuario = nombreUnico();
    const datos = { usuario, nombre: "Uno", password: "clave-de-prueba-123" };
    await crearUsuario(db, datos);
    expect(await mensajeDe(crearUsuario(db, datos))).toMatch(/ya existe/);
    expect(await mensajeDe(cambiarPassword(db, { usuario: nombreUnico(), password: "clave-de-prueba-123" }))).toMatch(
      /no existe/,
    );
  });

  it("--cambiar pone la contraseña nueva y cierra las sesiones, sin tocar el nombre", async () => {
    const usuario = nombreUnico();
    await crearUsuario(db, { usuario, nombre: "Uno", password: "clave-vieja-1234" });
    const [fila] = await db.select().from(usuarios).where(eq(usuarios.usuario, usuario));
    if (!fila) throw new Error("sin fila");
    const { token } = await crearSesion(db, fila.id);
    expect(await cambiarPassword(db, { usuario, password: "clave-nueva-1234" })).toEqual({ activo: true });
    expect(await usuarioDeSesion(db, token)).toBeNull();
    expect(await db.select().from(sesiones).where(eq(sesiones.usuario_id, fila.id))).toHaveLength(0);
    expect(await verificarCredenciales(db, usuario, "clave-vieja-1234")).toBeNull();
    expect(await verificarCredenciales(db, usuario, "clave-nueva-1234")).toEqual({ id: fila.id, nombre: "Uno", debe_cambiar_clave: false });
  });

  it("--cambiar no reactiva a un usuario desactivado; --reactivar sí", async () => {
    const usuario = nombreUnico();
    await crearUsuario(db, { usuario, nombre: "Uno", password: "clave-vieja-1234" });
    await db.update(usuarios).set({ activo: false }).where(eq(usuarios.usuario, usuario));
    expect(await cambiarPassword(db, { usuario, password: "clave-nueva-1234" })).toEqual({ activo: false });
    expect(await verificarCredenciales(db, usuario, "clave-nueva-1234")).toBeNull();
    expect(await cambiarPassword(db, { usuario, password: "clave-nueva-1234" }, { reactivar: true })).toEqual({
      activo: true,
    });
    expect(await verificarCredenciales(db, usuario, "clave-nueva-1234")).not.toBeNull();
  });

  it("rechaza contraseñas cortas y usuarios raros, sin repetir la contraseña en el mensaje", async () => {
    const corta = "cortita";
    const mensaje = await mensajeDe(crearUsuario(db, { usuario: nombreUnico(), nombre: "X", password: corta }));
    expect(mensaje).toMatch(/entre 12 y 200/);
    expect(mensaje).not.toContain(corta);
    expect(await mensajeDe(crearUsuario(db, { usuario: "a b", nombre: "X", password: "clave-de-prueba-123" }))).toMatch(
      /usuario/,
    );
    expect(
      await mensajeDe(crearUsuario(db, { usuario: nombreUnico(), nombre: "  ", password: "clave-de-prueba-123" })),
    ).toMatch(/nombre/);
  });

  it("un error de la base no se muestra: ni la consulta, ni sus parámetros, ni el hash", async () => {
    const rota = crearDb(urlTest(), { max: 1 });
    await rota.cerrar();
    const usuario = nombreUnico();
    for (const intento of [
      () => crearUsuario(rota.db, { usuario, nombre: "Nombre Visible", password: "clave-de-prueba-123" }),
      () => cambiarPassword(rota.db, { usuario, password: "clave-de-prueba-123" }),
    ]) {
      const mensaje = await mensajeDe(intento());
      expect(mensaje).toBe("Error al escribir en la base (detalle omitido).");
      expect(mensaje).not.toContain(usuario);
    }
  });
});
