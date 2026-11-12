/**
 * Ayudas para los tests del panel. Todo ficticio: RUT con `generarRutFicticio()`, nombres
 * inventados e imágenes sintéticas de 8x8.
 */
import { COOKIE_SESION, generarRutFicticio } from "@club-colina/shared";
import { construirApp } from "../../app";
import type { Db } from "../../db/cliente";
import { apoderados, jugadorApoderado, jugadores } from "../../db/schema";
import { guardarFoto } from "../../lib/fotos";
import { generarToken } from "../../lib/tokens";
import { configTest, JPEG_PRUEBA } from "../../test/db";
import { crearSesion } from "../../services/panel/sesiones";
import { crearUsuario } from "../../services/panel/usuarios";
import { usuarios } from "../../db/schema";
import { eq } from "drizzle-orm";

let n = 0;

/** App con una sesión válida: las peticiones del panel llevan `cookies`. */
export async function appConSesion(db: Db) {
  n += 1;
  const usuario = `panel${Date.now()}x${n}`;
  await crearUsuario(db, { usuario, nombre: "Mony Prueba", password: "clave-de-prueba-123" });
  const [fila] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.usuario, usuario));
  if (!fila) throw new Error("sin usuario");
  const { token } = await crearSesion(db, fila.id);
  const app = await construirApp({ config: configTest(), db });
  return { app, cookies: { [COOKIE_SESION]: token } };
}

type NuevoJugador = Partial<typeof jugadores.$inferInsert>;
type NuevoApoderado = Partial<typeof apoderados.$inferInsert>;

export async function fotoPrueba(db: Db): Promise<string> {
  return guardarFoto(db, JPEG_PRUEBA);
}

/** Jugador precargado de vóley, incompleto (sin número ni foto), salvo lo que se pase. */
export async function crearJugador(db: Db, extra: NuevoJugador = {}): Promise<string> {
  const [fila] = await db
    .insert(jugadores)
    .values({
      rut: generarRutFicticio(),
      nombre: "Josefa",
      apellido: "Ficticia",
      fecha_nacimiento: "2013-05-10",
      disciplina: "voleibol",
      origen: "base_2026",
      ...extra,
    })
    .returning({ id: jugadores.id });
  if (!fila) throw new Error("sin jugador");
  return fila.id;
}

/** Jugador activo y completo. */
export async function crearJugadorActivo(db: Db, extra: NuevoJugador = {}): Promise<string> {
  return crearJugador(db, {
    numero_camiseta: "7",
    foto_id: await fotoPrueba(db),
    estado: "activo",
    credencial_token: generarToken(),
    ...extra,
  });
}

export async function crearApoderado(db: Db, extra: NuevoApoderado = {}): Promise<string> {
  const [fila] = await db
    .insert(apoderados)
    .values({
      rut: generarRutFicticio(),
      nombre: "Pedro",
      apellido: "Inventado",
      telefono: "912345678",
      origen: "base_2026",
      ...extra,
    })
    .returning({ id: apoderados.id });
  if (!fila) throw new Error("sin apoderado");
  return fila.id;
}

export async function vincular(db: Db, jugadorId: string, apoderadoId: string, extra: { estado?: "pendiente" | "activo"; paga_mensualidad?: boolean } = {}) {
  await db.insert(jugadorApoderado).values({ jugador_id: jugadorId, apoderado_id: apoderadoId, ...extra });
}

/** Cuerpo multipart para `app.inject`. */
export function multipart(
  partes: Array<{ nombre: string; valor: string } | { nombre: string; archivo: Buffer; tipo?: string }>,
) {
  const boundary = `----prueba${generarToken().slice(0, 16)}`;
  const trozos: Buffer[] = [];
  for (const p of partes) {
    if ("valor" in p) {
      trozos.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.nombre}"\r\n\r\n${p.valor}\r\n`));
    } else {
      trozos.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${p.nombre}"; filename="foto.jpg"\r\nContent-Type: ${p.tipo ?? "image/jpeg"}\r\n\r\n`,
        ),
        p.archivo,
        Buffer.from("\r\n"),
      );
    }
  }
  trozos.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(trozos), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}
