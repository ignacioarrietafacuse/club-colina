import type { cambioEstadoResponse, TIPOS_PERSONA } from "@club-colina/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { z } from "zod";
import type { Ejecutor } from "../../db/cliente";
import { apoderados, entrenadores, jugadorApoderado, jugadores } from "../../db/schema";
import { ErrorApi, noEncontrado } from "../../lib/errores";
import { borrarFoto, guardarFoto, leerFoto } from "../../lib/fotos";
import { generarToken } from "../../lib/tokens";
import { tieneApoderadoVigente } from "./personas";
import { faltantesApoderado, faltantesJugador } from "./reglas";

export type TipoPersona = (typeof TIPOS_PERSONA)[number];
type CambioEstado = z.input<typeof cambioEstadoResponse>;

/** Estados desde los que Mony puede activar (los pendientes se aprueban por su solicitud). */
const ACTIVABLES = new Set(["precargado", "inactivo"]);
/** Estados desde los que Mony puede desactivar (un precargado que se fue del club, por ejemplo). */
const DESACTIVABLES = new Set(["activo", "precargado"]);

const conflicto = (mensaje: string) => new ErrorApi(409, "conflicto", mensaje);


/**
 * Quita la marca "ya no está en el club" que dejó el formulario: Mony confirmó con la familia que
 * el jugador sigue. La marca es solo una señal; no impide aprobarlo ni activarlo.
 */
export async function quitarMarcaRetiro(db: Ejecutor, id: string): Promise<void> {
  const filas = await db
    .update(jugadores)
    .set({ marcado_retiro_en: null })
    .where(eq(jugadores.id, id))
    .returning({ id: jugadores.id });
  if (filas.length === 0) throw noEncontrado();
}

export function incompleto(faltantes: readonly string[]): ErrorApi {
  return new ErrorApi(422, "requisitos_incompletos", `Faltan datos: ${faltantes.join(", ")}`);
}

/** 404 si la persona no existe. */
async function exigirExistencia(db: Ejecutor, tipo: TipoPersona, id: string): Promise<void> {
  await fotoIdDe(db, tipo, id);
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

async function fotoIdDe(db: Ejecutor, tipo: TipoPersona, id: string, bloquear = false) {
  const consulta =
    tipo === "jugadores"
      ? db.select({ foto_id: jugadores.foto_id }).from(jugadores).where(eq(jugadores.id, id))
      : tipo === "apoderados"
        ? db.select({ foto_id: apoderados.foto_id }).from(apoderados).where(eq(apoderados.id, id))
        : db.select({ foto_id: entrenadores.foto_id }).from(entrenadores).where(eq(entrenadores.id, id));
  const [fila] = bloquear ? await consulta.for("update") : await consulta;
  if (!fila) throw noEncontrado();
  return fila.foto_id;
}

export async function fotoDePersona(db: Ejecutor, tipo: TipoPersona, id: string) {
  const fotoId = await fotoIdDe(db, tipo, id);
  const foto = fotoId ? await leerFoto(db, fotoId) : null;
  if (!foto) throw noEncontrado();
  return foto;
}

/** Guarda la foto nueva, la deja en la ficha y borra la anterior, todo en una transacción. */
export async function cambiarFoto(db: Ejecutor, tipo: TipoPersona, id: string, bytes: Buffer): Promise<void> {
  await db.transaction(async (tx) => {
    const anterior = await fotoIdDe(tx, tipo, id, true);
    const nueva = await guardarFoto(tx, bytes);
    if (tipo === "jugadores") await tx.update(jugadores).set({ foto_id: nueva }).where(eq(jugadores.id, id));
    else if (tipo === "apoderados") await tx.update(apoderados).set({ foto_id: nueva }).where(eq(apoderados.id, id));
    else await tx.update(entrenadores).set({ foto_id: nueva }).where(eq(entrenadores.id, id));
    if (anterior) await borrarFoto(tx, anterior);
  });
}

// ---------------------------------------------------------------------------
// Credencial
// ---------------------------------------------------------------------------

/** Token nuevo para una persona activa (si se filtró su QR). El anterior deja de servir. */
export async function regenerarToken(db: Ejecutor, tipo: TipoPersona, id: string): Promise<string> {
  const token = generarToken();
  const filas =
    tipo === "jugadores"
      ? await db
          .update(jugadores)
          .set({ credencial_token: token })
          .where(and(eq(jugadores.id, id), eq(jugadores.estado, "activo")))
          .returning({ id: jugadores.id })
      : tipo === "apoderados"
        ? await db
            .update(apoderados)
            .set({ credencial_token: token })
            .where(and(eq(apoderados.id, id), eq(apoderados.estado, "activo")))
            .returning({ id: apoderados.id })
        : await db
            .update(entrenadores)
            .set({ credencial_token: token })
            .where(and(eq(entrenadores.id, id), eq(entrenadores.estado, "activo")))
            .returning({ id: entrenadores.id });
  if (filas.length === 0) {
    await exigirExistencia(db, tipo, id);
    throw conflicto("Solo una persona activa tiene credencial");
  }
  return token;
}

/**
 * Al activar a un precargado, sus vínculos de la base 2026 (`solicitud_id` nulo) que sigan
 * pendientes pasan a activos si el otro extremo ya está activo. Un vínculo que creó una solicitud
 * no se toca: se decide desde esa solicitud. La importación ya los escribe activos; esto cubre un
 * vínculo de la base que haya quedado pendiente.
 */
async function activarVinculosDeLaBase(tx: Ejecutor, rol: "jugador" | "apoderado", id: string): Promise<void> {
  const otroActivo =
    rol === "jugador"
      ? inArray(
          jugadorApoderado.apoderado_id,
          tx.select({ id: apoderados.id }).from(apoderados).where(eq(apoderados.estado, "activo")),
        )
      : inArray(
          jugadorApoderado.jugador_id,
          tx.select({ id: jugadores.id }).from(jugadores).where(eq(jugadores.estado, "activo")),
        );
  await tx
    .update(jugadorApoderado)
    .set({ estado: "activo" })
    .where(
      and(
        eq(rol === "jugador" ? jugadorApoderado.jugador_id : jugadorApoderado.apoderado_id, id),
        isNull(jugadorApoderado.solicitud_id),
        eq(jugadorApoderado.estado, "pendiente"),
        otroActivo,
      ),
    );
}

/**
 * Activa a un precargado que Mony completó en el panel, o reactiva a un inactivo. Exige lo mismo
 * que la aprobación y genera un `credencial_token` nuevo.
 */
export async function activar(db: Ejecutor, tipo: TipoPersona, id: string): Promise<CambioEstado> {
  const token = generarToken();
  await db.transaction(async (tx) => {
    if (tipo === "jugadores") {
      const [j] = await tx
        .select({
          estado: jugadores.estado,
          nombre: jugadores.nombre,
          apellido: jugadores.apellido,
          fecha_nacimiento: jugadores.fecha_nacimiento,
          numero_camiseta: jugadores.numero_camiseta,
          telefono: jugadores.telefono,
          foto_id: jugadores.foto_id,
          disciplina: jugadores.disciplina,
        })
        .from(jugadores)
        .where(eq(jugadores.id, id))
        .for("update");
      if (!j) throw noEncontrado();
      if (!ACTIVABLES.has(j.estado)) throw conflicto("Solo se activa a un precargado o a un inactivo");
      // Primero sus vínculos de la base: uno con un apoderado activo ya cuenta como contacto. Si
      // después falta algo, la transacción se deshace entera.
      if (j.estado === "precargado") await activarVinculosDeLaBase(tx, "jugador", id);
      const [contacto] = await tx.select({ si: tieneApoderadoVigente }).from(jugadores).where(eq(jugadores.id, id));
      const faltan = faltantesJugador(j, contacto?.si ?? false);
      if (faltan.length > 0) throw incompleto(faltan);
      await tx
        .update(jugadores)
        .set({
          estado: "activo",
          credencial_token: token,
          // Reactivar a un inactivo es Mony diciendo que volvió al club: la marca "ya no está" que
          // llevó a darlo de baja deja de aplicar.
          ...(j.estado === "inactivo" ? { marcado_retiro_en: null } : {}),
        })
        .where(eq(jugadores.id, id));
    } else if (tipo === "apoderados") {
      const [a] = await tx
        .select({
          estado: apoderados.estado,
          nombre: apoderados.nombre,
          apellido: apoderados.apellido,
          telefono: apoderados.telefono,
          foto_id: apoderados.foto_id,
        })
        .from(apoderados)
        .where(eq(apoderados.id, id))
        .for("update");
      if (!a) throw noEncontrado();
      if (!ACTIVABLES.has(a.estado)) throw conflicto("Solo se activa a un precargado o a un inactivo");
      const faltan = faltantesApoderado(a);
      if (faltan.length > 0) throw incompleto(faltan);
      await tx.update(apoderados).set({ estado: "activo", credencial_token: token }).where(eq(apoderados.id, id));
      if (a.estado === "precargado") await activarVinculosDeLaBase(tx, "apoderado", id);
    } else {
      const [e] = await tx
        .select({ estado: entrenadores.estado })
        .from(entrenadores)
        .where(eq(entrenadores.id, id))
        .for("update");
      if (!e) throw noEncontrado();
      if (e.estado !== "inactivo") throw conflicto("El entrenador ya está activo");
      await tx
        .update(entrenadores)
        .set({ estado: "activo", credencial_token: token })
        .where(eq(entrenadores.id, id));
    }
  });
  return { estado: "activo", credencial_token: token };
}

/** Deja a la persona inactiva y anula su credencial. Si ya estaba inactiva, no hace nada. */
export async function desactivar(db: Ejecutor, tipo: TipoPersona, id: string): Promise<CambioEstado> {
  await db.transaction(async (tx) => {
    const consulta =
      tipo === "jugadores"
        ? tx.select({ estado: jugadores.estado }).from(jugadores).where(eq(jugadores.id, id))
        : tipo === "apoderados"
          ? tx.select({ estado: apoderados.estado }).from(apoderados).where(eq(apoderados.id, id))
          : tx.select({ estado: entrenadores.estado }).from(entrenadores).where(eq(entrenadores.id, id));
    const [fila] = await consulta.for("update");
    if (!fila) throw noEncontrado();
    if (fila.estado === "inactivo") return;
    if (!DESACTIVABLES.has(fila.estado)) {
      throw conflicto("Una persona pendiente o rechazada se maneja desde su solicitud");
    }
    const cambio = { estado: "inactivo" as const, credencial_token: null };
    if (tipo === "jugadores") await tx.update(jugadores).set(cambio).where(eq(jugadores.id, id));
    else if (tipo === "apoderados") await tx.update(apoderados).set(cambio).where(eq(apoderados.id, id));
    else await tx.update(entrenadores).set(cambio).where(eq(entrenadores.id, id));
  });
  return { estado: "inactivo", credencial_token: null };
}
