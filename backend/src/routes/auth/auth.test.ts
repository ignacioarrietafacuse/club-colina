import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { COOKIE_SESION } from "@club-colina/shared";
import { construirApp } from "../../app";
import { crearDb } from "../../db/cliente";
import { sesiones, usuarios } from "../../db/schema";
import { LIMITES } from "../../lib/limite-intentos";
import { hashToken } from "../../lib/tokens";
import { configTest, dbTest, urlTest } from "../../test/db";
import { crearUsuario } from "../../services/panel/usuarios";
import { LIMITE_LOGIN_IP } from "./index";

const { db, cerrar } = dbTest();
afterAll(cerrar);

const PASSWORD = "una-clave-de-prueba-larga";
let contador = 0;

/** Un usuario ficticio nuevo para cada test (la base de tests se comparte). */
async function usuarioNuevo(): Promise<string> {
  contador += 1;
  const usuario = `prueba${Date.now()}x${contador}`;
  await crearUsuario(db, { usuario, nombre: "Usuaria Prueba", password: PASSWORD });
  return usuario;
}

function login(app: FastifyInstance, usuario: string, password = PASSWORD, ip = "198.51.100.1") {
  return app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { "x-real-ip": ip },
    payload: { usuario, password },
  });
}

function cookieDe(r: Awaited<ReturnType<typeof login>>): string {
  const c = r.cookies.find((x) => x.name === COOKIE_SESION);
  if (!c) throw new Error("sin cookie");
  return c.value;
}

describe("login y sesiones", () => {
  it("con las credenciales correctas deja una cookie httpOnly y /me responde", async () => {
    const app = await construirApp({ config: configTest(), db });
    const usuario = await usuarioNuevo();
    const r = await login(app, usuario);
    expect(r.statusCode).toBe(200);
    expect(r.headers["cache-control"]).toBe("private, no-store");
    expect(r.json()).toEqual({ usuario: { id: expect.any(String), nombre: "Usuaria Prueba" } });
    const c = r.cookies.find((x) => x.name === COOKIE_SESION);
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe("Lax");
    expect(c?.path).toBe("/");
    expect(c?.secure).toBe(true);
    expect(c?.domain).toBeUndefined();
    // La base guarda solo el hash del token.
    const token = cookieDe(r);
    const filas = await db.select().from(sesiones).where(eq(sesiones.id, hashToken(token)));
    expect(filas).toHaveLength(1);
    expect(JSON.stringify(filas)).not.toContain(token);

    const me = await app.inject({ method: "GET", url: "/api/auth/me", cookies: { [COOKIE_SESION]: token } });
    expect(me.statusCode).toBe(200);
    expect(me.json().usuario.nombre).toBe("Usuaria Prueba");
    // Con sesión, el panel deja pasar (esta ruta no existe: 404 en vez de 401).
    const panel = await app.inject({
      method: "GET",
      url: "/api/panel/no-existe",
      cookies: { [COOKIE_SESION]: token },
    });
    expect(panel.statusCode).toBe(404);
    await app.close();
  });

  it.each(["development", "production"] as const)(
    "en %s la cookie cumple __Host-: Secure, Path=/ y sin Domain, también al borrarla",
    async (NODE_ENV) => {
      const app = await construirApp({ config: configTest({ NODE_ENV }), db });
      const r = await login(app, await usuarioNuevo());
      const salida = await app.inject({
        method: "POST",
        url: "/api/auth/logout",
        cookies: { [COOKIE_SESION]: cookieDe(r) },
      });
      expect(COOKIE_SESION).toBe("__Host-sesion");
      for (const cabecera of [r.headers["set-cookie"], salida.headers["set-cookie"]]) {
        const linea = String(cabecera);
        expect(linea.startsWith("__Host-sesion=")).toBe(true);
        expect(linea).toMatch(/; Secure(;|$)/);
        expect(linea).toMatch(/; Path=\/(;|$)/);
        expect(linea).not.toMatch(/Domain=/i);
      }
      await app.close();
    },
  );

  it("normaliza el usuario: mayúsculas y espacios dan lo mismo", async () => {
    const app = await construirApp({ config: configTest(), db });
    const usuario = await usuarioNuevo();
    expect((await login(app, `  ${usuario.toUpperCase()} `)).statusCode).toBe(200);
    await app.close();
  });

  it("contraseña mala, usuario inexistente o inactivo: 401 igual, sin cookie", async () => {
    const app = await construirApp({ config: configTest(), db });
    const usuario = await usuarioNuevo();
    const inactivo = await usuarioNuevo();
    await db.update(usuarios).set({ activo: false }).where(eq(usuarios.usuario, inactivo));
    const respuestas = [
      await login(app, usuario, "otra-clave-cualquiera", "198.51.100.2"),
      await login(app, "no-existe-nadie", PASSWORD, "198.51.100.3"),
      await login(app, inactivo, PASSWORD, "198.51.100.4"),
    ];
    for (const r of respuestas) {
      expect(r.statusCode).toBe(401);
      expect(r.json().error.codigo).toBe("credenciales_invalidas");
      expect(r.cookies.find((x) => x.name === COOKIE_SESION)).toBeUndefined();
    }
    expect(new Set(respuestas.map((r) => r.body)).size).toBe(1);
    await app.close();
  });

  it("/me sin sesión: 401 y sin caché", async () => {
    const app = await construirApp({ config: configTest(), db });
    const r = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(r.statusCode).toBe(401);
    expect(r.headers["cache-control"]).toBe("private, no-store");
    await app.close();
  });

  it("un cuerpo inválido es 400 validacion", async () => {
    const app = await construirApp({ config: configTest(), db });
    const r = await app.inject({ method: "POST", url: "/api/auth/login", payload: { usuario: "x" } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.codigo).toBe("validacion");
    await app.close();
  });

  it("logout borra la sesión: después /me y el panel niegan", async () => {
    const app = await construirApp({ config: configTest(), db });
    const token = cookieDe(await login(app, await usuarioNuevo()));
    const cookies = { [COOKIE_SESION]: token };
    const r = await app.inject({ method: "POST", url: "/api/auth/logout", cookies });
    expect(r.statusCode).toBe(204);
    expect(r.cookies.find((x) => x.name === COOKIE_SESION)?.value).toBe("");
    expect(await db.select().from(sesiones).where(eq(sesiones.id, hashToken(token)))).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: "/api/auth/me", cookies })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/panel/dashboard", cookies })).statusCode).toBe(401);
    // Logout sin sesión no falla.
    expect((await app.inject({ method: "POST", url: "/api/auth/logout" })).statusCode).toBe(204);
    await app.close();
  });

  it("sin sesión, con una inventada, vencida o de un usuario desactivado: 401", async () => {
    const app = await construirApp({ config: configTest(), db });
    const usuario = await usuarioNuevo();
    const vencida = cookieDe(await login(app, usuario, PASSWORD, "198.51.100.5"));
    await db
      .update(sesiones)
      .set({ expira_en: new Date(Date.now() - 1000) })
      .where(eq(sesiones.id, hashToken(vencida)));
    const otro = await usuarioNuevo();
    const deDesactivado = cookieDe(await login(app, otro, PASSWORD, "198.51.100.6"));
    await db.update(usuarios).set({ activo: false }).where(eq(usuarios.usuario, otro));

    for (const valor of [undefined, "inventada", "a".repeat(43), vencida, deDesactivado]) {
      const cookies: Record<string, string> = valor === undefined ? {} : { [COOKIE_SESION]: valor };
      for (const url of ["/api/auth/me", "/api/panel/dashboard", "/api/panel/no-existe"]) {
        const r = await app.inject({ method: "GET", url, cookies });
        expect(r.statusCode).toBe(401);
        expect(r.json().error.codigo).toBe("no_autenticado");
      }
    }
    await app.close();
  });

  it("si la base falla al verificar la sesión, el panel tampoco deja pasar", async () => {
    const rota = crearDb(urlTest(), { max: 1 });
    await rota.cerrar();
    const app = await construirApp({ config: configTest(), db: rota.db });
    const r = await app.inject({
      method: "GET",
      url: "/api/panel/no-existe",
      cookies: { [COOKIE_SESION]: "a".repeat(43) },
    });
    expect(r.statusCode).toBe(500);
    expect(r.json().error.codigo).toBe("error_interno");
    await app.close();
  });
});

describe("límites de intentos del login", () => {
  it("muchos intentos al mismo usuario desde la misma IP: el límite usuario + IP cuenta junto al de IP", async () => {
    const app = await construirApp({ config: configTest(), db });
    const usuario = await usuarioNuevo();
    const ip = "203.0.113.50";
    const codigos: number[] = [];
    for (let i = 0; i < LIMITES.login.max + 3; i++) {
      // Variantes de mayúsculas y espacios: la llave normaliza igual que el login.
      const variante = i % 2 === 0 ? usuario : ` ${usuario.toUpperCase()} `;
      codigos.push((await login(app, variante, "mala-clave-cualquiera", ip)).statusCode);
    }
    expect(codigos).toEqual([
      ...Array<number>(LIMITES.login.max).fill(401),
      ...Array<number>(3).fill(429),
    ]);
    // Bloqueado incluso con la contraseña correcta.
    const r = await login(app, usuario, PASSWORD, ip);
    expect(r.statusCode).toBe(429);
    expect(r.json().error.codigo).toBe("demasiados_intentos");
    // El mismo usuario desde otra IP tiene su propio contador.
    expect((await login(app, usuario, PASSWORD, "203.0.113.51")).statusCode).toBe(200);
    await app.close();
  });

  it("cambiar de usuario no da intentos nuevos: el tope por IP corta", async () => {
    const app = await construirApp({ config: configTest(), db });
    const ip = "203.0.113.60";
    const codigos: number[] = [];
    for (let i = 0; i < LIMITE_LOGIN_IP.max + 2; i++) {
      codigos.push((await login(app, `nadie-${i}`, "mala-clave-cualquiera", ip)).statusCode);
    }
    expect(codigos).toEqual([
      ...Array<number>(LIMITE_LOGIN_IP.max).fill(401),
      ...Array<number>(2).fill(429),
    ]);
    // Un usuario válido desde esa IP también queda frenado; otra IP no.
    const usuario = await usuarioNuevo();
    expect((await login(app, usuario, PASSWORD, ip)).statusCode).toBe(429);
    expect((await login(app, usuario, PASSWORD, "203.0.113.61")).statusCode).toBe(200);
    await app.close();
  });

  it("los dos límites suman en la misma ruta: los intentos bloqueados por usuario también cuentan por IP", async () => {
    const app = await construirApp({ config: configTest(), db });
    const ip = "203.0.113.70";
    const usuario = await usuarioNuevo();
    let r429 = 0;
    // Primero se agota el de usuario + IP, y se sigue insistiendo con el mismo usuario.
    for (let i = 0; i < LIMITE_LOGIN_IP.max; i++) {
      if ((await login(app, usuario, "mala-clave-cualquiera", ip)).statusCode === 429) r429 += 1;
    }
    expect(r429).toBe(LIMITE_LOGIN_IP.max - LIMITES.login.max);
    // Ya se gastaron los intentos de la IP: un usuario nuevo desde ahí queda frenado.
    expect((await login(app, await usuarioNuevo(), PASSWORD, ip)).statusCode).toBe(429);
    await app.close();
  });
});
