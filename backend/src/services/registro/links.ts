import { type CompletarResponse, type FamiliaResponse, token as esquemaToken } from "@club-colina/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Db, Ejecutor } from "../../db/cliente";
import { apoderados, entrenadores, jugadorApoderado, jugadores, solicitudesRegistro } from "../../db/schema";
import { ErrorApi, noEncontrado } from "../../lib/errores";
import { guardarFoto } from "../../lib/fotos";
import { hashToken } from "../../lib/tokens";
import { nombreCompleto, primerNombre } from "./consulta";

/** Un token con forma inválida es un 404 genérico, igual que uno que no existe. */
export function tokenValido(valor: string): boolean {
  return esquemaToken.safeParse(valor).success;
}

type EstadoPublico = FamiliaResponse["personas"][number]["estado"];

/** El link privado muestra "pendiente" mientras la persona no está aprobada. */
function estadoPublico(estado: string): EstadoPublico {
  if (estado === "activo" || estado === "rechazado" || estado === "inactivo") return estado;
  return "pendiente";
}

async function solicitudPorToken(db: Ejecutor, token: string, tipo: "formulario" | "segundo_apoderado") {
  if (!tokenValido(token)) return null;
  const [s] = await db
    .select()
    .from(solicitudesRegistro)
    .where(and(eq(solicitudesRegistro.token_acceso_hash, hashToken(token)), eq(solicitudesRegistro.tipo, tipo)));
  return s ?? null;
}

/**
 * GET /familia/:token_acceso — solo las personas que llegaron en esa solicitud: las que tienen ese
 * `solicitud_id` y los hijos cuyo vínculo creó la solicitud, estos solo cuando Mony lo aprobó.
 * Nunca el resto de la familia de la base, ni un hijo marcado "ya no está". El token se busca solo
 * entre solicitudes de tipo `formulario`.
 */
export async function verFamilia(db: Db, token: string): Promise<FamiliaResponse> {
  const s = await solicitudPorToken(db, token, "formulario");
  if (!s) throw noEncontrado();

  const aps = await db
    .select()
    .from(apoderados)
    .where(eq(apoderados.solicitud_id, s.id))
    .orderBy(asc(apoderados.creado_en), asc(apoderados.id));
  const propios = await db
    .select()
    .from(jugadores)
    .where(and(eq(jugadores.solicitud_id, s.id), isNull(jugadores.marcado_retiro_en)))
    .orderBy(asc(jugadores.creado_en), asc(jugadores.id));
  const porVinculo = await db
    .selectDistinct({ jugador: jugadores })
    .from(jugadorApoderado)
    .innerJoin(jugadores, eq(jugadores.id, jugadorApoderado.jugador_id))
    .where(
      and(
        eq(jugadorApoderado.solicitud_id, s.id),
        eq(jugadorApoderado.estado, "activo"),
        isNull(jugadores.marcado_retiro_en),
      ),
    );
  const vistos = new Set(propios.map((j) => j.id));
  const jugadoresSolicitud = [
    ...propios,
    ...porVinculo
      .map((f) => f.jugador)
      .filter((j) => !vistos.has(j.id))
      .sort((a, b) => a.creado_en.getTime() - b.creado_en.getTime() || (a.id < b.id ? -1 : 1)),
  ];

  const persona = (p: { nombre: string | null; apellido: string | null; estado: string; credencial_token: string | null }, rol: "jugador" | "apoderado") => {
    const estado = estadoPublico(p.estado);
    return {
      nombre_completo: nombreCompleto(p),
      rol,
      estado,
      ...(estado === "activo" && p.credencial_token ? { credencial_token: p.credencial_token } : {}),
    };
  };

  const segundas = await db
    .select({ id: solicitudesRegistro.id })
    .from(solicitudesRegistro)
    .where(eq(solicitudesRegistro.solicitud_origen_id, s.id))
    .orderBy(asc(solicitudesRegistro.creada_en), asc(solicitudesRegistro.id));
  const otros =
    segundas.length === 0
      ? []
      : await db
          .select({ nombre: apoderados.nombre, apellido: apoderados.apellido, foto_id: apoderados.foto_id })
          .from(apoderados)
          .where(inArray(apoderados.solicitud_id, segundas.map((x) => x.id)))
          .orderBy(asc(apoderados.creado_en), asc(apoderados.id));

  return {
    estado_solicitud: s.estado,
    personas: [...aps.map((a) => persona(a, "apoderado")), ...jugadoresSolicitud.map((j) => persona(j, "jugador"))],
    otros_apoderados: otros.map((o) => ({ nombre_completo: nombreCompleto(o), foto_subida: o.foto_id !== null })),
  };
}

/** El segundo apoderado del link `/completar/:token` (solo solicitudes `segundo_apoderado`). */
async function segundoApoderado(db: Ejecutor, token: string) {
  const s = await solicitudPorToken(db, token, "segundo_apoderado");
  if (!s) return null;
  const [a] = await db.select().from(apoderados).where(eq(apoderados.solicitud_id, s.id));
  return a ? { solicitud: s, apoderado: a } : null;
}

/**
 * GET /completar/:token — su primer nombre, si ya subió la foto y, cuando Mony lo aprobó, su
 * propio `credencial_token` para ver su QR. Nada de la familia.
 */
export async function verCompletar(db: Db, token: string): Promise<CompletarResponse> {
  const encontrado = await segundoApoderado(db, token);
  if (!encontrado) throw noEncontrado();
  const { apoderado: a } = encontrado;
  return {
    primer_nombre: primerNombre(a.nombre),
    foto_subida: a.foto_id !== null,
    ...(a.estado === "activo" && a.credencial_token ? { credencial_token: a.credencial_token } : {}),
  };
}

/**
 * POST /completar/:token — sube la foto del segundo apoderado y registra su consentimiento. Una sola
 * vez: con la foto ya subida es 409 (si hay que cambiarla, lo hace Mony en el panel). El link solo
 * existe para un otro apoderado nuevo, que se crea pendiente.
 */
export async function subirFotoCompletar(db: Db, token: string, foto: Buffer): Promise<void> {
  await db.transaction(async (tx) => {
    const encontrado = await segundoApoderado(tx, token);
    if (!encontrado) throw noEncontrado();
    const { apoderado: a, solicitud: s } = encontrado;
    if (a.foto_id !== null || a.estado !== "pendiente") {
      throw new ErrorApi(409, "conflicto", "La foto ya se subió.");
    }
    const fotoId = await guardarFoto(tx, foto);
    const ahora = new Date();
    const filas = await tx
      .update(apoderados)
      .set({ foto_id: fotoId })
      .where(and(eq(apoderados.id, a.id), isNull(apoderados.foto_id)))
      .returning({ id: apoderados.id });
    if (filas.length === 0) throw new ErrorApi(409, "conflicto", "La foto ya se subió.");
    await tx
      .update(solicitudesRegistro)
      .set({ consentimiento_en: ahora })
      .where(eq(solicitudesRegistro.id, s.id));
  });
}

type Credencial = { nombre: string | null; apellido: string | null; foto_id: string | null; rol: "jugador" | "apoderado" | "entrenador" };

/**
 * La persona activa dueña de ese `credencial_token`, en cualquiera de las tres tablas. La base
 * garantiza que solo una persona activa tiene token, así que un revocado no aparece.
 */
export async function credencialActiva(db: Ejecutor, token: string): Promise<Credencial | null> {
  if (!tokenValido(token)) return null;
  const columnas = (t: typeof jugadores | typeof apoderados | typeof entrenadores) => ({
    nombre: t.nombre,
    apellido: t.apellido,
    foto_id: t.foto_id,
  });
  const [j] = await db
    .select(columnas(jugadores))
    .from(jugadores)
    .where(and(eq(jugadores.credencial_token, token), eq(jugadores.estado, "activo")));
  if (j) return { ...j, rol: "jugador" };
  const [a] = await db
    .select(columnas(apoderados))
    .from(apoderados)
    .where(and(eq(apoderados.credencial_token, token), eq(apoderados.estado, "activo")));
  if (a) return { ...a, rol: "apoderado" };
  const [e] = await db
    .select(columnas(entrenadores))
    .from(entrenadores)
    .where(and(eq(entrenadores.credencial_token, token), eq(entrenadores.estado, "activo")));
  if (e) return { ...e, rol: "entrenador" };
  return null;
}
