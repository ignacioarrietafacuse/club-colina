import {
  type AvisoSolicitud,
  claveFoto,
  type Disciplina,
  type SolicitudCreadaResponse,
  type solicitudDatos,
} from "@club-colina/shared";
import { and, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Db, Ejecutor } from "../../db/cliente";
import { apoderados, categorias, fichasPrevias, jugadorApoderado, jugadores, solicitudesRegistro } from "../../db/schema";
import { CANDADO_SOLICITUDES } from "../../lib/candados";
import { ErrorApi } from "../../lib/errores";
import { guardarFoto } from "../../lib/fotos";
import { generarToken, hashToken } from "../../lib/tokens";
import {
  type Apoderado,
  apoderadoPorRut,
  calcularCategoria,
  EDAD_ADULTO,
  edad,
  esAdulto,
  hijosDeApoderado,
  type Jugador,
  jugadorPorRut,
  primerNombre,
} from "./consulta";

export type DatosSolicitud = z.output<typeof solicitudDatos>;
type Hijo = DatosSolicitud["hijos"][number];

const conflicto = () =>
  new ErrorApi(409, "conflicto", "Los datos cambiaron desde la consulta. Vuelve a escribir tu RUT.");

function invalido(campos: string[]): ErrorApi {
  return new ErrorApi(400, "validacion", `Datos inválidos: ${campos.join(", ")}`);
}

/**
 * Las claves de foto que nombra la solicitud y los archivos `foto_<clave>` del multipart tienen
 * que calzar uno a uno: ni una foto nombrada sin archivo ni un archivo que nadie nombra.
 */
export function verificarArchivos(datos: DatosSolicitud, archivos: ReadonlyMap<string, Buffer>) {
  const nombradas: string[] = [];
  if (datos.foto !== undefined) nombradas.push(datos.foto);
  for (const h of datos.hijos) if (h.foto !== undefined) nombradas.push(h.foto);
  const unicas = new Set(nombradas);
  const sobran = [...archivos.keys()].some((k) => !unicas.has(k));
  if (unicas.size !== nombradas.length || sobran || nombradas.some((k) => !archivos.has(k))) {
    throw new ErrorApi(400, "archivo_invalido", "Las fotos no calzan con los datos enviados.");
  }
}

/** Nombre del archivo del multipart → clave de foto, o null si no es `foto_<clave>` válido. */
export function claveDeArchivo(campo: string): string | null {
  const clave = campo.startsWith("foto_") ? campo.slice("foto_".length) : null;
  return clave !== null && claveFoto.safeParse(clave).success ? clave : null;
}

/** Lo que falta en una sección; se lanza junto, con los nombres de los campos. */
class Faltantes {
  readonly campos: string[] = [];
  exigir<T>(valor: T | undefined, campo: string): T | undefined {
    if (valor === undefined) this.campos.push(campo);
    return valor;
  }
  lanzarSiHay() {
    if (this.campos.length > 0) throw invalido(this.campos);
  }
}

/** Valores ya verificados por `lanzarSiHay`: undefined acá es un error del servidor. */
function seguro<T>(valor: T | undefined): T {
  if (valor === undefined) throw new Error("valor exigido sin verificar");
  return valor;
}

/** Los datos de un hijo nuevo: los mismos que se le piden a todo hijo nombrado por RUT. */
function exigirHijoCompleto(h: Hijo, p: string) {
  const faltan = new Faltantes();
  faltan.exigir(h.nombre, `${p}nombre`);
  faltan.exigir(h.apellido, `${p}apellido`);
  faltan.exigir(h.fecha_nacimiento, `${p}fecha_nacimiento`);
  faltan.exigir(h.disciplina, `${p}disciplina`);
  faltan.exigir(h.numero_camiseta, `${p}numero_camiseta`);
  faltan.exigir(h.foto, `${p}foto`);
  faltan.lanzarSiHay();
}

export async function crearSolicitud(
  db: Db,
  datos: DatosSolicitud,
  archivos: ReadonlyMap<string, Buffer>,
): Promise<SolicitudCreadaResponse> {
  verificarArchivos(datos, archivos);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CANDADO_SOLICITUDES})`);
    return new Proceso(tx, datos, archivos).ejecutar();
  });
}

class Proceso {
  private readonly ahora = new Date();
  private readonly avisos = new Set<AvisoSolicitud>();
  private readonly apoderadosInvolucrados = new Set<string>();
  private readonly jugadoresInvolucrados = new Set<string>();
  private readonly propias = new Set<string>();
  /** Solicitudes con una copia previa de alguien que esta solicitud no pudo modificar. */
  private readonly conCopiaAjena = new Set<string>();
  private solicitudId = "";
  private coincideBase = false;
  /** El titular precargado que esta solicitud modificó (tiene su copia en `fichas_previas`). */
  private titularConCopia: string | null = null;
  /** Quién llenó el formulario: con esto /familia sabe de quién son los hijos que muestra. */
  private titularApoderadoId: string | null = null;
  private titularJugadorId: string | null = null;

  constructor(
    private readonly tx: Ejecutor,
    private readonly datos: DatosSolicitud,
    private readonly archivos: ReadonlyMap<string, Buffer>,
  ) {}

  async ejecutar(): Promise<SolicitudCreadaResponse> {
    const tokenAcceso = generarToken();
    const [s] = await this.tx
      .insert(solicitudesRegistro)
      .values({ token_acceso_hash: hashToken(tokenAcceso), consentimiento_en: this.ahora, tipo: "formulario" })
      .returning({ id: solicitudesRegistro.id });
    if (!s) throw new Error("no se creó la solicitud");
    this.solicitudId = s.id;
    this.propias.add(s.id);

    let otros: SolicitudCreadaResponse["otros_apoderados"] = [];
    if (this.datos.tipo === "jugador_adulto") {
      await this.jugadorAdulto();
    } else {
      const titular = await this.apoderadoTitular();
      this.titularApoderadoId = titular.id;
      const resueltos = await this.hijos(titular);
      otros = await this.otroApoderado(resueltos);
    }

    await this.marcarSolicitudesAnteriores();
    await this.tx
      .update(solicitudesRegistro)
      .set({
        avisos: [...this.avisos],
        coincide_base: this.coincideBase,
        titular_apoderado_id: this.titularApoderadoId,
        titular_jugador_id: this.titularJugadorId,
      })
      .where(eq(solicitudesRegistro.id, this.solicitudId));
    return { token_acceso: tokenAcceso, otros_apoderados: otros };
  }

  /** Si otra solicitud tiene copia de esa persona (y la anota para avisarle). */
  private async copiaDeOtra(p: { jugador: Jugador } | { apoderado: Apoderado }): Promise<boolean> {
    const [copia] = await this.tx
      .select({ solicitud_id: fichasPrevias.solicitud_id })
      .from(fichasPrevias)
      .where("jugador" in p ? eq(fichasPrevias.jugador_id, p.jugador.id) : eq(fichasPrevias.apoderado_id, p.apoderado.id));
    if (!copia || copia.solicitud_id === this.solicitudId) return false;
    this.conCopiaAjena.add(copia.solicitud_id);
    this.avisos.add("cambios_bloqueados_por_otra_solicitud");
    return true;
  }

  /**
   * Antes de modificar la ficha de alguien que ya existía, guarda cómo estaba (`fichas_previas`),
   * para que S1 la restaure si Mony la rechaza. Solo la primera solicitud guarda la copia: si ya
   * hay una de otra solicitud, esta no modifica la ficha (devuelve false), solo vincula, y la
   * otra recibe `hay_solicitud_posterior`. Así ninguna pisa los cambios de la otra.
   */
  private async copiaPrevia(p: { jugador: Jugador } | { apoderado: Apoderado }): Promise<boolean> {
    if (await this.copiaDeOtra(p)) return false;
    const [propia] = await this.tx
      .select({ id: fichasPrevias.id })
      .from(fichasPrevias)
      .where("jugador" in p ? eq(fichasPrevias.jugador_id, p.jugador.id) : eq(fichasPrevias.apoderado_id, p.apoderado.id));
    if (propia) return true;
    if ("jugador" in p) {
      const j = p.jugador;
      await this.tx.insert(fichasPrevias).values({
        solicitud_id: this.solicitudId,
        jugador_id: j.id,
        datos: {
          nombre: j.nombre,
          apellido: j.apellido,
          fecha_nacimiento: j.fecha_nacimiento,
          disciplina: j.disciplina,
          categoria_id: j.categoria_id,
          numero_camiseta: j.numero_camiseta,
          telefono: j.telefono,
          email: j.email,
          metodo_pago: j.metodo_pago,
          foto_id: j.foto_id,
          estado: j.estado,
          solicitud_id: j.solicitud_id,
          marcado_retiro_en: j.marcado_retiro_en?.toISOString() ?? null,
        },
      });
    } else {
      const a = p.apoderado;
      await this.tx.insert(fichasPrevias).values({
        solicitud_id: this.solicitudId,
        apoderado_id: a.id,
        datos: {
          nombre: a.nombre,
          apellido: a.apellido,
          telefono: a.telefono,
          email: a.email,
          metodo_pago: a.metodo_pago,
          foto_id: a.foto_id,
          estado: a.estado,
          solicitud_id: a.solicitud_id,
        },
      });
    }
    return true;
  }

  private async foto(clave: string): Promise<string> {
    const bytes = this.archivos.get(clave);
    if (!bytes) throw new ErrorApi(400, "archivo_invalido", "Las fotos no calzan con los datos enviados.");
    return guardarFoto(this.tx, bytes);
  }

  /**
   * Categoría de una ficha existente: la calculada por año si se puede; si no, la elegida si es de
   * la rama de la ficha. Si no, queda vacía y Mony la completa al aprobar (decisión de Ignacio,
   * 2026-11-12). Una elegida de otra rama se ignora en vez de dar 400: lo enviado ya se validó
   * contra la rama enviada, y un 400 distinto revelaría que el RUT existe.
   */
  private async categoria(disciplina: Disciplina, fecha: string | null, elegida: number | undefined) {
    const calculada = await calcularCategoria(this.tx, disciplina, fecha);
    if (calculada !== null || elegida === undefined) return calculada;
    const [c] = await this.tx
      .select({ id: categorias.id })
      .from(categorias)
      .where(and(eq(categorias.id, elegida), eq(categorias.disciplina, disciplina)));
    return c?.id ?? null;
  }

  /** Teléfono: se completa si falta; si la base ya tiene uno, no se cambia y se avisa si difiere. */
  private telefono(actual: string | null, faltan: Faltantes, campo: string): string | undefined {
    if (actual === null) {
      this.avisos.add("sin_telefono_en_base");
      return faltan.exigir(this.datos.telefono, campo);
    }
    if (this.datos.telefono !== undefined && this.datos.telefono !== actual) {
      this.avisos.add("telefono_distinto_base");
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // Titular
  // -------------------------------------------------------------------------

  private async apoderadoTitular(): Promise<Apoderado> {
    const d = this.datos;
    const existente = await apoderadoPorRut(this.tx, d.rut, { bloquear: true });
    const faltan = new Faltantes();

    if (!existente) {
      const nombre = faltan.exigir(d.nombre, "nombre");
      const apellido = faltan.exigir(d.apellido, "apellido");
      const telefono = faltan.exigir(d.telefono, "telefono");
      const foto = faltan.exigir(d.foto, "foto");
      faltan.lanzarSiHay();
      const [nuevo] = await this.tx
        .insert(apoderados)
        .values({
          nombre: seguro(nombre),
          apellido: seguro(apellido),
          rut: d.rut,
          telefono: seguro(telefono),
          foto_id: await this.foto(seguro(foto)),
          estado: "pendiente",
          origen: "formulario",
          solicitud_id: this.solicitudId,
        })
        .returning();
      if (!nuevo) throw new Error("no se creó el apoderado");
      this.apoderadosInvolucrados.add(nuevo.id);
      return nuevo;
    }

    this.apoderadosInvolucrados.add(existente.id);
    if (existente.estado !== "precargado") {
      // Ya registrado: sus datos no se piden ni se modifican; solo hijos y otro apoderado.
      this.avisos.add("titular_ya_registrado");
      if (d.hijos.length === 0 && d.otro_apoderado === undefined) throw invalido(["hijos"]);
      return existente;
    }

    this.coincideBase = true;
    // Precargado: se completa solo lo que falta. Lo que ya está en la base no se cambia.
    const nombre = existente.nombre === null ? faltan.exigir(d.nombre, "nombre") : undefined;
    const apellido = existente.apellido === null ? faltan.exigir(d.apellido, "apellido") : undefined;
    const telefono = this.telefono(existente.telefono, faltan, "telefono");
    const foto = existente.foto_id === null ? faltan.exigir(d.foto, "foto") : undefined;
    faltan.lanzarSiHay();
    if (!(await this.copiaPrevia({ apoderado: existente }))) return existente;
    this.titularConCopia = existente.id;
    const [actualizado] = await this.tx
      .update(apoderados)
      .set({
        ...(nombre !== undefined && { nombre }),
        ...(apellido !== undefined && { apellido }),
        ...(telefono !== undefined && { telefono }),
        ...(foto !== undefined && { foto_id: await this.foto(foto) }),
        estado: "pendiente",
        solicitud_id: existente.solicitud_id ?? this.solicitudId,
      })
      .where(eq(apoderados.id, existente.id))
      .returning();
    if (!actualizado) throw new Error("no se actualizó el apoderado");
    return actualizado;
  }

  /**
   * Jugador adulto. Exige el formulario completo antes de mirar la base, para que la respuesta
   * no revele si el RUT está (un menor responde `encontrado: false` en la consulta). Una ficha
   * existente solo se completa si es un precargado adulto con certeza y sin apoderados: si no,
   * 409 sin tocar nada (un menor sin fecha en la base no se puede "adoptar" como adulto).
   */
  private async jugadorAdulto() {
    const d = this.datos;
    if (d.hijos.length > 0) throw invalido(["hijos"]);
    if (d.otro_apoderado !== undefined) throw invalido(["otro_apoderado"]);
    const faltan = new Faltantes();
    const nombre = faltan.exigir(d.nombre, "nombre");
    const apellido = faltan.exigir(d.apellido, "apellido");
    const telefono = faltan.exigir(d.telefono, "telefono");
    const fecha = faltan.exigir(d.fecha_nacimiento, "fecha_nacimiento");
    const disciplina = faltan.exigir(d.disciplina, "disciplina");
    const numero = faltan.exigir(d.numero_camiseta, "numero_camiseta");
    const foto = faltan.exigir(d.foto, "foto");
    faltan.lanzarSiHay();
    if (edad(seguro(fecha)) < EDAD_ADULTO) throw invalido(["fecha_nacimiento"]);
    const categoriaElegida = await this.categoriaDeRama(seguro(disciplina), d.categoria_id, "categoria_id");

    // Si el RUT es apoderado, el formulario lo trata como apoderado (ver rut-lookup).
    if (await apoderadoPorRut(this.tx, d.rut)) throw conflicto();
    const existente = await jugadorPorRut(this.tx, d.rut, { bloquear: true });

    if (!existente) {
      const calculada = await calcularCategoria(this.tx, seguro(disciplina), seguro(fecha));
      const [nuevo] = await this.tx
        .insert(jugadores)
        .values({
          nombre: seguro(nombre),
          apellido: seguro(apellido),
          rut: d.rut,
          telefono: seguro(telefono),
          fecha_nacimiento: seguro(fecha),
          disciplina: seguro(disciplina),
          categoria_id: calculada ?? categoriaElegida,
          numero_camiseta: seguro(numero),
          foto_id: await this.foto(seguro(foto)),
          estado: "pendiente",
          origen: "formulario",
          solicitud_id: this.solicitudId,
        })
        .returning({ id: jugadores.id });
      if (!nuevo) throw new Error("no se creó el jugador");
      this.jugadoresInvolucrados.add(nuevo.id);
      this.titularJugadorId = nuevo.id;
      return;
    }

    if (
      existente.estado !== "precargado" ||
      existente.solicitud_id !== null ||
      !esAdulto(existente) ||
      (await this.cantidadApoderados(existente.id)) > 0
    ) {
      throw conflicto();
    }
    this.jugadoresInvolucrados.add(existente.id);
    this.titularJugadorId = existente.id;
    this.coincideBase = true;
    const telefonoNuevo = this.telefono(existente.telefono, new Faltantes(), "telefono");
    const { cambios, foto: fotoFaltante } = await this.completarJugador(existente, d, "", new Faltantes());
    // Otra solicitud ya la modificó y Mony no la decidió: no se pisa. En la práctica no se llega
    // acá (una ficha con copia ya no es precargada sin solicitud ni vínculos, y dio 409 arriba).
    if (!(await this.copiaPrevia({ jugador: existente }))) throw conflicto();
    await this.tx
      .update(jugadores)
      .set({
        ...cambios,
        ...(fotoFaltante !== undefined && { foto_id: await this.foto(fotoFaltante) }),
        ...(telefonoNuevo !== undefined && { telefono: telefonoNuevo }),
        estado: "pendiente",
        solicitud_id: this.solicitudId,
      })
      .where(eq(jugadores.id, existente.id));
  }

  private async cantidadApoderados(jugadorId: string, salvo?: string): Promise<number> {
    const [{ cantidad = 0 } = {}] = await this.tx
      .select({ cantidad: sql<number>`count(*)::int` })
      .from(jugadorApoderado)
      .where(
        and(
          eq(jugadorApoderado.jugador_id, jugadorId),
          salvo === undefined ? undefined : ne(jugadorApoderado.apoderado_id, salvo),
        ),
      );
    return cantidad;
  }

  /** La categoría elegida tiene que ser de la rama que se envió; si no, 400. */
  private async categoriaDeRama(disciplina: Disciplina, elegida: number | undefined, campo: string) {
    if (elegida === undefined) return null;
    const [c] = await this.tx
      .select({ id: categorias.id })
      .from(categorias)
      .where(and(eq(categorias.id, elegida), eq(categorias.disciplina, disciplina)));
    if (!c) throw invalido([campo]);
    return c.id;
  }

  /**
   * Lo que le falta a un jugador precargado, sin cambiar lo que ya trae la base. Lanza 400 con los
   * campos que faltan (`prefijo` = "hijos.N." o "" para el adulto). No escribe nada: la foto se
   * devuelve como clave y se guarda solo si la ficha se modifica (ver `copiaPrevia`).
   */
  private async completarJugador(
    j: Jugador,
    h: Pick<Hijo, "nombre" | "apellido" | "fecha_nacimiento" | "numero_camiseta" | "categoria_id" | "foto">,
    prefijo: string,
    faltan: Faltantes,
  ) {
    const nombre = j.nombre === null ? faltan.exigir(h.nombre, `${prefijo}nombre`) : undefined;
    const apellido = j.apellido === null ? faltan.exigir(h.apellido, `${prefijo}apellido`) : undefined;
    const fecha =
      j.fecha_nacimiento === null ? faltan.exigir(h.fecha_nacimiento, `${prefijo}fecha_nacimiento`) : undefined;
    const numero =
      j.numero_camiseta === null ? faltan.exigir(h.numero_camiseta, `${prefijo}numero_camiseta`) : undefined;
    const foto = j.foto_id === null ? faltan.exigir(h.foto, `${prefijo}foto`) : undefined;
    const categoria =
      j.categoria_id === null
        ? await this.categoria(j.disciplina, j.fecha_nacimiento ?? fecha ?? null, h.categoria_id)
        : null;
    faltan.lanzarSiHay();
    return {
      cambios: {
        ...(nombre !== undefined && { nombre }),
        ...(apellido !== undefined && { apellido }),
        ...(fecha !== undefined && { fecha_nacimiento: fecha }),
        ...(numero !== undefined && { numero_camiseta: numero }),
        ...(categoria !== null && { categoria_id: categoria }),
      },
      foto,
    };
  }

  /** Aplica lo completado a un jugador que ya existía, si `copiaPrevia` lo permite (devuelve si lo hizo). */
  private async completarExistente(
    j: Jugador,
    completado: Awaited<ReturnType<Proceso["completarJugador"]>>,
    extra: { solicitud_id?: string },
  ): Promise<boolean> {
    if (!(await this.copiaPrevia({ jugador: j }))) return false;
    await this.tx
      .update(jugadores)
      .set({
        ...completado.cambios,
        ...(completado.foto !== undefined && { foto_id: await this.foto(completado.foto) }),
        estado: "pendiente",
        ...extra,
      })
      .where(eq(jugadores.id, j.id));
    return true;
  }

  // -------------------------------------------------------------------------
  // Hijos
  // -------------------------------------------------------------------------

  private async vincular(jugadorId: string, apoderadoId: string, paga: boolean) {
    await this.tx
      .insert(jugadorApoderado)
      .values({
        jugador_id: jugadorId,
        apoderado_id: apoderadoId,
        paga_mensualidad: paga,
        estado: "pendiente",
        solicitud_id: this.solicitudId,
      })
      .onConflictDoNothing();
  }

  /**
   * Procesa los hijos. Devuelve, por índice, el jugador que quedó en la solicitud (null si se
   * marcó "ya no está"), para vincular al otro apoderado.
   */
  private async hijos(titular: Apoderado): Promise<(string | null)[]> {
    const d = this.datos;
    const lista = await hijosDeApoderado(this.tx, titular.id, { bloquear: true });
    const paga = d.paga_mensualidad ?? false;
    const vistos = new Set<string>();
    const resueltos: (string | null)[] = [];

    for (const [i, h] of d.hijos.entries()) {
      const p = `hijos.${i}.`;
      let jugador: Jugador | null;
      if ("precargado" in h.ref) {
        const item = lista[h.ref.precargado];
        // La lista cambió entre la consulta y el envío: no se adivina a quién se refería.
        if (!item || primerNombre(item.jugador.nombre) !== h.ref.primer_nombre) throw conflicto();
        jugador = item.jugador;
      } else {
        jugador = await jugadorPorRut(this.tx, h.ref.rut, { bloquear: true });
      }
      const enLista = jugador !== null && lista.some((x) => x.jugador.id === jugador.id);
      if (jugador) {
        if (vistos.has(jugador.id)) throw invalido([`${p}ref`]);
        vistos.add(jugador.id);
        this.jugadoresInvolucrados.add(jugador.id);
      }

      // Un hijo nombrado por RUT exige el formulario completo, exista o no en la base: si se
      // pidiera menos cuando existe, la diferencia entre un 400 y un 201 revelaría que el RUT está.
      if ("rut" in h.ref && !h.ya_no_esta) {
        exigirHijoCompleto(h, p);
        await this.categoriaDeRama(seguro(h.disciplina), h.categoria_id, `${p}categoria_id`);
      }

      if (h.ya_no_esta) {
        // Solo se puede marcar a un hijo propio. Queda marcado para que Mony lo confirme, sin
        // `solicitud_id`: no aparece en /familia.
        if (!jugador || !enLista) throw invalido([`${p}ya_no_esta`]);
        // Si otra solicitud tiene copia de este hijo, no se toca y ella recibe el aviso de solicitud
        // posterior. Si ya venía marcado, no hay nada que copiar: solo se mira la otra solicitud.
        // El aviso de "ya no está" va solo si esta solicitud pudo marcarlo.
        const puede =
          jugador.marcado_retiro_en === null
            ? await this.copiaPrevia({ jugador })
            : !(await this.copiaDeOtra({ jugador }));
        if (puede) {
          if (jugador.marcado_retiro_en === null) {
            await this.tx
              .update(jugadores)
              .set({ marcado_retiro_en: this.ahora })
              .where(eq(jugadores.id, jugador.id));
          }
          this.avisos.add("hijo_marcado_ya_no_esta");
        }
        resueltos.push(null);
        continue;
      }

      if (!jugador) {
        resueltos.push(await this.hijoNuevo(h, p, paga, titular.id));
        continue;
      }

      if (enLista) {
        // Hijo del RUT de quien llena: se completa y llega en esta solicitud.
        if (jugador.estado === "precargado") {
          const completado = await this.completarJugador(jugador, h, p, new Faltantes());
          await this.completarExistente(jugador, completado, { solicitud_id: jugador.solicitud_id ?? this.solicitudId });
        }
        if (this.titularConCopia === titular.id && d.paga_mensualidad !== undefined) {
          await this.pagaDeVinculoBase(jugador.id, titular.id, d.paga_mensualidad);
        }
        resueltos.push(jugador.id);
        continue;
      }

      // Un jugador que ya existía y no es de la lista de quien llena: entra solo por un vínculo
      // pendiente, sin `solicitud_id`, y no aparece en /familia hasta que Mony lo aprueba.
      const cantidad = await this.cantidadApoderados(jugador.id, titular.id);
      if (cantidad > 0) this.avisos.add("hijo_con_otro_apoderado");
      if (jugador.estado !== "precargado") {
        this.avisos.add("apoderado_nuevo_para_hijo_registrado");
      } else if (cantidad === 0) {
        // Hijo precargado sin apoderado en la base: se le pide solo lo que falta (diseño, "Carga
        // inicial"). La ficha queda pendiente; la solicitud sigue sin ser suya.
        const completado = await this.completarJugador(jugador, h, p, new Faltantes());
        // El aviso va solo si se aplicó: con copia de otra solicitud queda el de cambios bloqueados.
        if (await this.completarExistente(jugador, completado, {})) {
          this.avisos.add("hijo_precargado_completado_por_rut");
        }
      }
      await this.vincular(jugador.id, titular.id, paga);
      resueltos.push(jugador.id);
    }
    return resueltos;
  }

  /**
   * Cambia `paga_mensualidad` de un vínculo que ya estaba en la base y guarda el valor anterior en
   * la copia del titular (`vinculos_paga`), para que S1 lo devuelva si Mony rechaza al titular.
   * Solo se llama si esta solicitud tiene la copia del titular: si no, no modifica nada suyo.
   */
  private async pagaDeVinculoBase(jugadorId: string, apoderadoId: string, paga: boolean) {
    // Solo vínculos de la base (sin solicitud): uno pendiente de otra solicitud se decide allá.
    const donde = and(
      eq(jugadorApoderado.jugador_id, jugadorId),
      eq(jugadorApoderado.apoderado_id, apoderadoId),
      isNull(jugadorApoderado.solicitud_id),
    );
    const [v] = await this.tx.select({ paga: jugadorApoderado.paga_mensualidad }).from(jugadorApoderado).where(donde);
    if (!v || v.paga === paga) return;
    const anotada = await this.tx
      .update(fichasPrevias)
      .set({
        datos: sql`${fichasPrevias.datos} || jsonb_build_object('vinculos_paga', coalesce(${fichasPrevias.datos} -> 'vinculos_paga', '{}'::jsonb) || jsonb_build_object(${jugadorId}::text, ${v.paga}::boolean))`,
      })
      .where(and(eq(fichasPrevias.apoderado_id, apoderadoId), eq(fichasPrevias.solicitud_id, this.solicitudId)))
      .returning({ id: fichasPrevias.id });
    // Sin la copia donde anotar el valor anterior no se cambia nada: no habría cómo volverlo atrás.
    if (anotada.length !== 1) throw new Error("sin copia del titular para anotar paga_mensualidad");
    await this.tx.update(jugadorApoderado).set({ paga_mensualidad: paga }).where(donde);
  }

  private async hijoNuevo(h: Hijo, p: string, paga: boolean, apoderadoId: string): Promise<string> {
    exigirHijoCompleto(h, p);
    if (!("rut" in h.ref)) throw conflicto();
    const faltan = new Faltantes();
    const nombre = faltan.exigir(h.nombre, `${p}nombre`);
    const apellido = faltan.exigir(h.apellido, `${p}apellido`);
    const fecha = faltan.exigir(h.fecha_nacimiento, `${p}fecha_nacimiento`);
    const disciplina = faltan.exigir(h.disciplina, `${p}disciplina`);
    const numero = faltan.exigir(h.numero_camiseta, `${p}numero_camiseta`);
    const foto = faltan.exigir(h.foto, `${p}foto`);
    faltan.lanzarSiHay();
    const elegida = await this.categoriaDeRama(seguro(disciplina), h.categoria_id, `${p}categoria_id`);
    const categoria = (await calcularCategoria(this.tx, seguro(disciplina), seguro(fecha))) ?? elegida;
    const [nuevo] = await this.tx
      .insert(jugadores)
      .values({
        nombre: seguro(nombre),
        apellido: seguro(apellido),
        rut: h.ref.rut,
        fecha_nacimiento: seguro(fecha),
        disciplina: seguro(disciplina),
        categoria_id: categoria,
        numero_camiseta: seguro(numero),
        foto_id: await this.foto(seguro(foto)),
        estado: "pendiente",
        origen: "formulario",
        solicitud_id: this.solicitudId,
      })
      .returning({ id: jugadores.id });
    if (!nuevo) throw new Error("no se creó el jugador");
    this.jugadoresInvolucrados.add(nuevo.id);
    await this.vincular(nuevo.id, apoderadoId, paga);
    return nuevo.id;
  }

  // -------------------------------------------------------------------------
  // Otro apoderado
  // -------------------------------------------------------------------------

  /**
   * Otro apoderado. Si es nuevo, queda creado sin foto, con su propia solicitud `segundo_apoderado`
   * y un link `/completar`. Si ya existía en la base (en cualquier estado), solo se vincula y se
   * avisa: no se le asigna solicitud, no se emite link y no se devuelve nada suyo, porque quien
   * llena no es esa persona y podría estar suplantándola.
   */
  private async otroApoderado(resueltos: (string | null)[]): Promise<SolicitudCreadaResponse["otros_apoderados"]> {
    const otro = this.datos.otro_apoderado;
    if (otro === undefined) return [];
    const hijos: string[] = [];
    for (const i of otro.hijos) {
      const j = resueltos[i];
      if (j === null || j === undefined) throw invalido(["otro_apoderado.hijos"]);
      hijos.push(j);
    }

    const existente = await apoderadoPorRut(this.tx, otro.rut);
    const salida: SolicitudCreadaResponse["otros_apoderados"] = [];
    let apoderadoId: string;
    if (existente) {
      this.avisos.add("otro_apoderado_ya_registrado");
      apoderadoId = existente.id;
    } else {
      const completarToken = generarToken();
      const [s2] = await this.tx
        .insert(solicitudesRegistro)
        .values({
          token_acceso_hash: hashToken(completarToken),
          tipo: "segundo_apoderado",
          solicitud_origen_id: this.solicitudId,
        })
        .returning({ id: solicitudesRegistro.id });
      if (!s2) throw new Error("no se creó la solicitud del segundo apoderado");
      this.propias.add(s2.id);
      const [nuevo] = await this.tx
        .insert(apoderados)
        .values({
          nombre: otro.nombre,
          apellido: otro.apellido,
          rut: otro.rut,
          telefono: otro.telefono,
          estado: "pendiente",
          origen: "formulario",
          solicitud_id: s2.id,
        })
        .returning({ id: apoderados.id });
      if (!nuevo) throw new Error("no se guardó el otro apoderado");
      apoderadoId = nuevo.id;
      // Lo que escribió quien llena; nunca un dato leído de la base.
      salida.push({ nombre_completo: `${otro.nombre} ${otro.apellido}`, completar_token: completarToken });
    }

    this.apoderadosInvolucrados.add(apoderadoId);
    const registrados = await this.tx
      .select({ id: jugadores.id })
      .from(jugadores)
      .where(
        and(
          inArray(jugadores.id, hijos),
          ne(jugadores.estado, "precargado"),
          // Los que llegaron en esta misma solicitud no estaban registrados.
          sql`${jugadores.solicitud_id} is distinct from ${this.solicitudId}`,
        ),
      );
    if (registrados.length > 0) this.avisos.add("apoderado_nuevo_para_hijo_registrado");
    for (const jugadorId of hijos) await this.vincular(jugadorId, apoderadoId, false);
    return salida;
  }

  // -------------------------------------------------------------------------
  // Avisos
  // -------------------------------------------------------------------------

  /**
   * `hay_solicitud_posterior` a las solicitudes pendientes anteriores que involucran a las mismas
   * personas: por el `solicitud_id` de la persona o por un vínculo que crearon.
   */
  private async marcarSolicitudesAnteriores() {
    const aps = [...this.apoderadosInvolucrados];
    const jus = [...this.jugadoresInvolucrados];
    const ids = new Set<string>();
    const agregar = (filas: { id: string | null }[]) => {
      for (const f of filas) if (f.id) ids.add(f.id);
    };
    if (aps.length > 0) {
      agregar(
        await this.tx.select({ id: apoderados.solicitud_id }).from(apoderados).where(inArray(apoderados.id, aps)),
      );
      agregar(
        await this.tx
          .select({ id: jugadorApoderado.solicitud_id })
          .from(jugadorApoderado)
          .where(inArray(jugadorApoderado.apoderado_id, aps)),
      );
    }
    if (jus.length > 0) {
      agregar(await this.tx.select({ id: jugadores.solicitud_id }).from(jugadores).where(inArray(jugadores.id, jus)));
      agregar(
        await this.tx
          .select({ id: jugadorApoderado.solicitud_id })
          .from(jugadorApoderado)
          .where(inArray(jugadorApoderado.jugador_id, jus)),
      );
    }
    for (const id of this.conCopiaAjena) ids.add(id);
    const anteriores = [...ids].filter((id) => !this.propias.has(id));
    if (anteriores.length === 0) return;
    await this.tx
      .update(solicitudesRegistro)
      .set({ avisos: sql`array_append(${solicitudesRegistro.avisos}, 'hay_solicitud_posterior')` })
      .where(
        and(
          inArray(solicitudesRegistro.id, anteriores),
          notInArray(solicitudesRegistro.id, [...this.propias]),
          eq(solicitudesRegistro.estado, "pendiente"),
          sql`not ('hay_solicitud_posterior' = any(${solicitudesRegistro.avisos}))`,
        ),
      );
  }
}
