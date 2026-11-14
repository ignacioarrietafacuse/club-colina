/**
 * Importación de la base de inscripciones 2026 (docs/diseno-credenciales-qr.md, "Carga inicial
 * desde la base del club"). Se corre una sola vez, en la Ola 3, con respaldo previo y el OK de
 * Ignacio. Se puede volver a correr sin duplicar: la llave es el RUT, lo que ya existe no se toca
 * y solo se vinculan personas creadas en la misma corrida.
 *
 *   pnpm --filter @club-colina/backend exec tsx scripts/importar-base-2026.ts <archivo.xlsx> \
 *     [--hoja <nombre>] [--columna campo=Encabezado ...] (--dry-run | --aplicar) [--produccion]
 *
 * - Lee DATABASE_URL del entorno. Fuera de localhost exige `--produccion` (guarda de host).
 * - `--dry-run` hace todo dentro de una transacción y la deshace: el resumen es el mismo que
 *   daría la corrida real, sin escribir nada.
 * - `--aplicar` escribe de verdad. Hay que elegir uno de los dos: olvidar `--dry-run` no escribe.
 * - Todo o nada: la corrida real también va en una sola transacción. Mientras dura, los RUT que
 *   inserta quedan bloqueados: correrla cuando nadie esté usando el formulario.
 * - Nunca imprime datos personales: el resumen trae conteos, motivos y números de fila.
 * - La planilla nunca entra al repo; los tests usan datos sintéticos.
 */
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import readXlsxFile, { readSheetNames } from "read-excel-file/node";
import { DISCIPLINAS, METODOS_PAGO, normalizarRut } from "@club-colina/shared";
import { crearDb, type Db, type Ejecutor } from "../src/db/cliente";
import { apoderados, categorias, jugadorApoderado, jugadores } from "../src/db/schema";
import { categoriaDelJugador } from "../src/lib/categorias";
import { resumirError } from "../src/lib/errores";
import { verificarHostDestino } from "../src/lib/guarda-host";

type Disciplina = (typeof DISCIPLINAS)[number];
type MetodoPago = (typeof METODOS_PAGO)[number];

/** Error con un mensaje que se puede mostrar: nunca lleva valores de la planilla. */
export class ErrorImportacion extends Error {}

// ---------------------------------------------------------------------------
// Columnas
// ---------------------------------------------------------------------------

export const CAMPOS = [
  "jugador_nombre",
  "jugador_apellido",
  "jugador_rut",
  "fecha_nacimiento",
  "rama",
  "categoria",
  "postula_beca",
  "apoderado_nombre",
  "apoderado_rut",
  "apoderado_telefono",
  "apoderado_email",
  "metodo_pago",
] as const;
export type Campo = (typeof CAMPOS)[number];

/**
 * Encabezados que se reconocen para cada campo, ya normalizados (minúsculas, sin tildes ni
 * signos). La planilla real no está en el repo: si sus encabezados no calzan, se agregan acá en
 * un PR o se indican al correr con `--columna campo=Encabezado`. La comparación es exacta, para
 * que "Teléfono 2" no se tome por el teléfono principal.
 */
const ALIAS: Record<Campo, readonly string[]> = {
  jugador_nombre: ["nombre jugador", "nombre del jugador", "nombres jugador", "nombres del jugador", "nombre", "nombres"],
  jugador_apellido: ["apellido jugador", "apellido del jugador", "apellidos jugador", "apellidos del jugador", "apellido", "apellidos"],
  jugador_rut: ["rut jugador", "rut del jugador", "rut jugadora", "rut"],
  fecha_nacimiento: ["fecha nacimiento", "fecha de nacimiento", "fecha nacimiento jugador", "fecha de nacimiento del jugador", "nacimiento"],
  rama: ["rama", "disciplina", "deporte"],
  categoria: ["categoria", "categoria jugador"],
  postula_beca: ["postula beca", "postula a beca", "beca", "postula a beca 2026"],
  apoderado_nombre: ["nombre apoderado", "nombre del apoderado", "nombre completo apoderado", "nombre completo del apoderado", "apoderado"],
  apoderado_rut: ["rut apoderado", "rut del apoderado"],
  apoderado_telefono: ["telefono apoderado", "telefono del apoderado", "celular apoderado", "telefono", "celular"],
  apoderado_email: ["correo apoderado", "correo del apoderado", "email apoderado", "correo", "email", "mail", "correo electronico"],
  metodo_pago: ["metodo de pago", "metodo pago", "forma de pago", "medio de pago"],
};

/** Minúsculas, sin tildes y con los signos convertidos en un espacio. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim();
}

function normalizarEncabezado(valor: unknown): string {
  return typeof valor === "string" ? normalizarTexto(valor).replace(/\./g, " ").replace(/\s+/g, " ").trim() : "";
}

export type Columnas = Record<Campo, number>;

/**
 * Busca la fila de encabezados (la primera donde se reconoce el RUT del jugador) y la columna
 * de cada campo. Falla si falta un campo o si dos columnas calzan con el mismo: el mensaje
 * nombra campos y encabezados, nunca celdas de datos.
 */
export function ubicarColumnas(
  filas: readonly (readonly unknown[])[],
  extra: Partial<Record<Campo, string>> = {},
): { filaEncabezado: number; columnas: Columnas } {
  const alias = (campo: Campo): readonly string[] => {
    const indicado = extra[campo];
    return indicado === undefined ? ALIAS[campo] : [normalizarEncabezado(indicado)];
  };
  const filaEncabezado = filas.findIndex((fila) =>
    fila.some((celda) => alias("jugador_rut").includes(normalizarEncabezado(celda))),
  );
  if (filaEncabezado === -1) {
    throw new ErrorImportacion(
      "No se encontró la fila de encabezados (ninguna columna se reconoce como el RUT del jugador). " +
        "Indícala con --columna jugador_rut=<Encabezado>.",
    );
  }
  const encabezados = (filas[filaEncabezado] ?? []).map(normalizarEncabezado);
  const faltan: Campo[] = [];
  const repetidos: Campo[] = [];
  const columnas: Partial<Columnas> = {};
  const usadas = new Map<number, Campo>();
  for (const campo of CAMPOS) {
    const calzan = encabezados.flatMap((e, i) => (e !== "" && alias(campo).includes(e) ? [i] : []));
    const indice = calzan[0];
    if (indice === undefined) faltan.push(campo);
    else if (calzan.length > 1 || usadas.has(indice)) repetidos.push(campo);
    else {
      columnas[campo] = indice;
      usadas.set(indice, campo);
    }
  }
  if (faltan.length > 0 || repetidos.length > 0) {
    // Solo los encabezados reconocidos: si la fila elegida fuera de datos (un --columna mal puesto),
    // el mensaje no la imprime.
    const reconocidos = [...usadas.entries()].map(([i, campo]) => `${campo} (columna ${i + 1})`);
    const partes = [
      faltan.length > 0 ? `faltan: ${faltan.join(", ")}` : "",
      repetidos.length > 0 ? `más de una columna calza con (o comparten columna): ${repetidos.join(", ")}` : "",
      `reconocidos en la fila ${filaEncabezado + 1}: ${reconocidos.join(", ") || "ninguno"}`,
      "Abre la planilla, mira el encabezado exacto y usa --columna campo=Encabezado.",
    ];
    throw new ErrorImportacion(`Columnas no reconocidas. ${partes.filter(Boolean).join(". ")}`);
  }
  return { filaEncabezado, columnas: completas(columnas) };
}

function completas(parcial: Partial<Columnas>): Columnas {
  const obtener = (campo: Campo): number => {
    const indice = parcial[campo];
    if (indice === undefined) throw new ErrorImportacion(`Falta la columna ${campo}`);
    return indice;
  };
  return {
    jugador_nombre: obtener("jugador_nombre"),
    jugador_apellido: obtener("jugador_apellido"),
    jugador_rut: obtener("jugador_rut"),
    fecha_nacimiento: obtener("fecha_nacimiento"),
    rama: obtener("rama"),
    categoria: obtener("categoria"),
    postula_beca: obtener("postula_beca"),
    apoderado_nombre: obtener("apoderado_nombre"),
    apoderado_rut: obtener("apoderado_rut"),
    apoderado_telefono: obtener("apoderado_telefono"),
    apoderado_email: obtener("apoderado_email"),
    metodo_pago: obtener("metodo_pago"),
  };
}

// ---------------------------------------------------------------------------
// Normalización de celdas (cada función devuelve null si el dato no es confiable)
// ---------------------------------------------------------------------------

/** Texto de una celda, sin espacios de más. Vacío → null. */
export function texto(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/\s+/g, " ").trim();
  return limpio === "" ? null : limpio;
}

export function rutDeCelda(valor: unknown): string | null {
  const t = texto(valor);
  return t === null ? null : normalizarRut(t);
}

/** 9 dígitos, sin +56. Teléfonos incompletos o con otro formato → null. */
export function normalizarTelefono(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null) return null;
  if (/[a-z]/i.test(t)) return null;
  let digitos = t.replace(/\D/g, "");
  if (digitos.length === 11 && digitos.startsWith("56")) digitos = digitos.slice(2);
  return /^[1-9][0-9]{8}$/.test(digitos) ? digitos : null;
}

/** Dominios mal escritos frecuentes: el correo se deja vacío para que la familia lo corrija. */
const DOMINIOS_MAL_ESCRITOS =
  /(^|\.)(gmial|gmai|gamil|gmal|hotmial|hotmai|hotmal|outlok|yaho)\.|\.(con|cmo|comm|cm)$|^(gmail|hotmail|outlook|yahoo|live)\.co$/;

export function normalizarEmail(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null) return null;
  const email = t.toLowerCase();
  if (!z.email().safeParse(email).success) return null;
  const dominio = email.slice(email.lastIndexOf("@") + 1);
  return DOMINIOS_MAL_ESCRITOS.test(dominio) ? null : email;
}

function fechaIso(anio: number, mes: number, dia: number): string | null {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    return null;
  }
  return `${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Fecha de nacimiento como `AAAA-MM-DD`. Acepta celdas de fecha, el número de serie de Excel y
 * los textos `dd-mm-aaaa`, `dd/mm/aaaa`, `dd.mm.aaaa` y `aaaa-mm-dd`. Una fecha que no existe,
 * futura o de alguien de más de 80 o menos de 3 años → null (fecha errónea).
 */
export function normalizarFecha(valor: unknown, hoy: Date): string | null {
  let iso: string | null = null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    iso = fechaIso(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate());
  } else if (typeof valor === "number" && Number.isInteger(valor) && valor > 0) {
    // Serie de Excel: días desde el 1899-12-30.
    const fecha = new Date(Date.UTC(1899, 11, 30) + valor * 86_400_000);
    iso = fechaIso(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate());
  } else {
    const t = texto(valor);
    if (t === null) return null;
    const dma = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
    const amd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (dma) iso = fechaIso(Number(dma[3]), Number(dma[2]), Number(dma[1]));
    else if (amd) iso = fechaIso(Number(amd[1]), Number(amd[2]), Number(amd[3]));
  }
  if (iso === null) return null;
  const anio = Number(iso.slice(0, 4));
  const anioHoy = hoy.getUTCFullYear();
  if (anio < anioHoy - 80 || anio > anioHoy - 3) return null;
  return iso;
}

/** Edad cumplida a la fecha `hoy`. */
export function edad(fechaNacimiento: string, hoy: Date): number {
  const [anio, mes, dia] = fechaNacimiento.split("-").map(Number);
  if (anio === undefined || mes === undefined || dia === undefined) return 0;
  const yaCumplio =
    hoy.getUTCMonth() + 1 > mes || (hoy.getUTCMonth() + 1 === mes && hoy.getUTCDate() >= dia);
  return hoy.getUTCFullYear() - anio - (yaCumplio ? 0 : 1);
}

export function normalizarDisciplina(valor: unknown): Disciplina | null {
  const t = texto(valor);
  if (t === null) return null;
  const n = normalizarTexto(t);
  const basquet = /basquet|basket|basquetbol/.test(n);
  const voley = /voley|volei|voleibol|volley/.test(n);
  if (basquet === voley) return null;
  return basquet ? "basketball" : "voleibol";
}

/** Uno solo de los tres métodos confirmados por Mony; vacío o ambiguo → null. */
export function normalizarMetodoPago(valor: unknown): MetodoPago | null {
  const t = texto(valor);
  if (t === null) return null;
  const n = normalizarTexto(t);
  const calzan: MetodoPago[] = [];
  if (n.includes("forpay")) calzan.push("forpay_mensual");
  if (n.includes("transferencia")) calzan.push("transferencia_anual");
  if (n.includes("tarjeta") || n.includes("credito")) calzan.push("tarjeta_credito_anual");
  return calzan.length === 1 ? (calzan[0] ?? null) : null;
}

/** Sí/no. Vacío → false. Cualquier otra cosa → null (ambiguo). */
export function normalizarSiNo(valor: unknown): boolean | null {
  if (typeof valor === "boolean") return valor;
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "number") return valor === 1 ? true : valor === 0 ? false : null;
  const t = texto(valor);
  if (t === null) return false;
  const n = normalizarTexto(t);
  if (["si", "s", "x", "true", "verdadero", "1"].includes(n)) return true;
  if (["no", "n", "false", "falso", "0", "-"].includes(n)) return false;
  return null;
}

/** El nombre del apoderado viene en una celda: se separa por el primer espacio. */
export function separarNombre(valor: unknown): { nombre: string | null; apellido: string | null } {
  const t = texto(valor);
  if (t === null) return { nombre: null, apellido: null };
  const espacio = t.indexOf(" ");
  if (espacio === -1) return { nombre: t, apellido: null };
  return { nombre: t.slice(0, espacio), apellido: t.slice(espacio + 1) };
}

/** "U-13", "u13", "Sub 13", "U11 F" → "U13", "U11F": para comparar con `categorias.nombre`. */
export function claveCategoria(valor: string): string {
  return normalizarTexto(valor).replace(/^sub/, "u").replace(/[^a-z0-9]/g, "").toUpperCase();
}

// ---------------------------------------------------------------------------
// Plan: qué se cargaría, sin tocar la base
// ---------------------------------------------------------------------------

export type Categoria = {
  id: number;
  nombre: string;
  disciplina: Disciplina;
  edad_min: number;
  edad_max: number;
  se_calcula: boolean;
};

/** La base es de la temporada 2026: la U11 F que trae se guarda como marca de esa temporada. */
export const TEMPORADA_BASE = 2026;
/** Un instante dentro de la temporada de la base, para comparar con la categoría calculada. */
const EN_TEMPORADA_BASE = new Date("2026-12-31T12:00:00-03:00");

export type JugadorPlan = {
  fila: number;
  rut: string;
  nombre: string | null;
  apellido: string | null;
  fecha_nacimiento: string | null;
  disciplina: Disciplina;
  /** `TEMPORADA_BASE` si la base la trae como U11 F; si no, null. La categoría no se importa. */
  u11f_temporada: number | null;
  postula_beca: boolean;
  telefono: string | null;
  email: string | null;
  metodo_pago: MetodoPago | null;
};

export type ApoderadoPlan = {
  fila: number;
  rut: string;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
  email: string | null;
  metodo_pago: MetodoPago | null;
};

export type VinculoPlan = { fila: number; jugadorRut: string; apoderadoRut: string; paga_mensualidad: boolean };

/** Motivo → números de fila (1 = primera fila de la hoja). */
export type PorMotivo = Record<string, number[]>;

export type Plan = {
  filas: number;
  filasVacias: number;
  jugadores: Map<string, JugadorPlan>;
  apoderados: Map<string, ApoderadoPlan>;
  vinculos: VinculoPlan[];
  jugadoresOmitidos: PorMotivo;
  apoderadosOmitidos: PorMotivo;
  /** Campos que se dejaron vacíos porque el dato de la planilla no era confiable. */
  camposVacios: PorMotivo;
  /** Avisos que no omiten a nadie (jugador sin apoderado, adulto con contacto propio, etc.). */
  notas: PorMotivo;
  /**
   * Básquet: cuántos jugadores traían en la base una categoría distinta de la calculada para la
   * temporada 2026, por categoría de la base. Solo conteos: ni filas ni datos personales.
   */
  categoriaDistinta: Record<string, number>;
};

function anotar(registro: PorMotivo, motivo: string, fila: number) {
  (registro[motivo] ??= []).push(fila);
}

/**
 * La categoría de la base ya no se importa: se calcula por edad de temporada. Solo la U11 F se
 * guarda, como marca de la temporada 2026. En básquet se cuenta, por categoría de la base, a
 * quienes traían una distinta de la calculada (vóley no la trae: se calculaba).
 */
function categoriaDeLaBase(
  disciplina: Disciplina,
  celdaCategoria: unknown,
  fecha: string | null,
  lista: readonly Categoria[],
  distinta: Record<string, number>,
  noReconocida: () => void,
): { u11f_temporada: number | null } {
  if (disciplina !== "basketball") return { u11f_temporada: null };
  const t = texto(celdaCategoria);
  if (t === null) return { u11f_temporada: null };
  const clave = claveCategoria(t);
  const base = lista.find((c) => c.disciplina === "basketball" && claveCategoria(c.nombre) === clave);
  if (base && !base.se_calcula) return { u11f_temporada: TEMPORADA_BASE };
  // Una U11 F escrita de una forma que no se reconoce ("U11 Fem") se perdería en silencio: la fila
  // queda en las notas para que Mony la marque a mano.
  if (!base) noReconocida();
  const calculada = categoriaDelJugador({ fecha_nacimiento: fecha, disciplina, u11f_temporada: null }, lista, EN_TEMPORADA_BASE);
  if (base?.id !== calculada) {
    const nombre = base?.nombre ?? "no reconocida";
    distinta[nombre] = (distinta[nombre] ?? 0) + 1;
  }
  return { u11f_temporada: null };
}

function filaVacia(fila: readonly unknown[]): boolean {
  return fila.every((celda) => texto(celda) === null && !(celda instanceof Date) && typeof celda !== "boolean");
}

/**
 * Aplica las reglas de la sección "Carga inicial" a cada fila (una por jugador). Función pura:
 * la base solo se consulta después, para saber qué ya existe.
 */
export function planificar(
  filas: readonly (readonly unknown[])[],
  columnas: Columnas,
  filaEncabezado: number,
  listaCategorias: readonly Categoria[],
  hoy: Date,
): Plan {
  const plan: Plan = {
    filas: 0,
    filasVacias: 0,
    jugadores: new Map(),
    apoderados: new Map(),
    vinculos: [],
    jugadoresOmitidos: {},
    apoderadosOmitidos: {},
    camposVacios: {},
    notas: {},
    categoriaDistinta: {},
  };
  const vinculosVistos = new Set<string>();
  /** Adultos sin apoderado (su contacto va en su ficha). */
  const adultosPropios = new Set<string>();
  /** RUT válidos de jugadores omitidos (rama no reconocida), con su fecha, para el cruce de RUT. */
  const omitidosConRut = new Map<string, string | null>();
  /** Por apoderado: filas que lo nombran y campos de contacto con un valor no confiable. */
  const filasApoderado = new Map<string, number[]>();
  const contactoMalo = new Map<string, { telefono?: number; correo?: number; pago?: number }>();
  const celda = (fila: readonly unknown[], campo: Campo) => fila[columnas[campo]];

  for (let i = filaEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i] ?? [];
    const n = i + 1;
    if (filaVacia(fila)) {
      plan.filasVacias++;
      continue;
    }
    plan.filas++;

    // --- Jugador
    const rutJugador = rutDeCelda(celda(fila, "jugador_rut"));
    const disciplina = normalizarDisciplina(celda(fila, "rama"));
    const fecha = normalizarFecha(celda(fila, "fecha_nacimiento"), hoy);
    let jugadorValido = true;
    if (rutJugador === null) {
      anotar(plan.jugadoresOmitidos, texto(celda(fila, "jugador_rut")) === null ? "rut_vacio" : "rut_invalido", n);
      jugadorValido = false;
    } else if (disciplina === null) {
      anotar(plan.jugadoresOmitidos, "rama_no_reconocida", n);
      if (!omitidosConRut.has(rutJugador)) omitidosConRut.set(rutJugador, fecha);
      jugadorValido = false;
    }
    const adulto = fecha !== null && edad(fecha, hoy) >= 18;

    // --- Apoderado (los datos de contacto son de quien llenó el formulario)
    const rutApoderadoTexto = texto(celda(fila, "apoderado_rut"));
    const rutApoderado = rutDeCelda(celda(fila, "apoderado_rut"));
    const telefonoTexto = texto(celda(fila, "apoderado_telefono"));
    const emailTexto = texto(celda(fila, "apoderado_email"));
    const pagoTexto = texto(celda(fila, "metodo_pago"));
    const telefono = normalizarTelefono(celda(fila, "apoderado_telefono"));
    const email = normalizarEmail(celda(fila, "apoderado_email"));
    const metodoPago = normalizarMetodoPago(celda(fila, "metodo_pago"));

    // Adulto que se inscribió solo: sin apoderado o con su propio RUT como apoderado.
    const adultoSinApoderado =
      jugadorValido && adulto && (rutApoderadoTexto === null || rutApoderado === rutJugador);
    let apoderadoValido = false;
    if (!adultoSinApoderado) {
      if (rutApoderadoTexto === null) {
        anotar(plan.apoderadosOmitidos, "rut_vacio", n);
      } else if (rutApoderado === null) {
        anotar(plan.apoderadosOmitidos, "rut_invalido", n);
      } else if (rutApoderado === rutJugador) {
        // Igual al del hijo menor (o sin fecha con qué saber si es adulto): no se carga.
        anotar(plan.apoderadosOmitidos, "rut_igual_al_del_jugador_menor_o_sin_fecha", n);
      } else {
        apoderadoValido = true;
      }
    }

    // Contacto del adulto sin apoderado: se anota ahora. El del apoderado, al final, porque otra
    // fila del mismo apoderado (hermanos) puede completar el dato.
    if (adultoSinApoderado) {
      if (telefonoTexto !== null && telefono === null) anotar(plan.camposVacios, "telefono_invalido", n);
      if (emailTexto !== null && email === null) anotar(plan.camposVacios, "correo_invalido", n);
      if (pagoTexto !== null && metodoPago === null) anotar(plan.camposVacios, "metodo_pago_ambiguo", n);
    } else if (apoderadoValido && rutApoderado !== null) {
      const malo = contactoMalo.get(rutApoderado) ?? {};
      if (telefonoTexto !== null && telefono === null) malo.telefono ??= n;
      if (emailTexto !== null && email === null) malo.correo ??= n;
      if (pagoTexto !== null && metodoPago === null) malo.pago ??= n;
      contactoMalo.set(rutApoderado, malo);
    } else if (jugadorValido && rutApoderado !== null && rutApoderado === rutJugador) {
      // Se puso a sí mismo como apoderado, pero sin fecha confiable no se sabe si es adulto.
      anotar(plan.notas, "contacto_descartado_rut_propio_sin_fecha", n);
    }

    if (jugadorValido && rutJugador !== null && disciplina !== null) {
      const previoJugador = plan.jugadores.get(rutJugador);
      if (previoJugador !== undefined) {
        // Mismo jugador en otra fila: se conserva la primera; el apoderado de esta igual se vincula.
        // El esquema admite una sola rama: si la otra fila es de la otra rama, Mony lo decide.
        anotar(
          plan.notas,
          previoJugador.disciplina === disciplina ? "jugador_repetido_en_otra_fila" : "jugador_en_dos_ramas",
          n,
        );
      } else {
        if (texto(celda(fila, "fecha_nacimiento")) !== null || celda(fila, "fecha_nacimiento") instanceof Date) {
          if (fecha === null) anotar(plan.camposVacios, "fecha_nacimiento_erronea", n);
        } else {
          anotar(plan.camposVacios, "fecha_nacimiento_vacia", n);
        }
        const categoria = categoriaDeLaBase(
          disciplina,
          celda(fila, "categoria"),
          fecha,
          listaCategorias,
          plan.categoriaDistinta,
          () => anotar(plan.notas, "categoria_basquet_no_reconocida", n),
        );
        let postula = normalizarSiNo(celda(fila, "postula_beca"));
        if (postula === null) {
          anotar(plan.camposVacios, "postula_beca_ambiguo", n);
          postula = false;
        }
        const nombre = texto(celda(fila, "jugador_nombre"));
        const apellido = texto(celda(fila, "jugador_apellido"));
        if (nombre === null || apellido === null) anotar(plan.camposVacios, "nombre_jugador_faltante", n);
        plan.jugadores.set(rutJugador, {
          fila: n,
          rut: rutJugador,
          nombre,
          apellido,
          fecha_nacimiento: fecha,
          disciplina,
          u11f_temporada: categoria.u11f_temporada,
          postula_beca: postula,
          // En jugadores adultos sin apoderado, el contacto va en su propia ficha.
          telefono: adultoSinApoderado ? telefono : null,
          email: adultoSinApoderado ? email : null,
          metodo_pago: adultoSinApoderado ? metodoPago : null,
        });
        if (adultoSinApoderado) {
          adultosPropios.add(rutJugador);
          anotar(plan.notas, "adulto_con_contacto_propio", n);
          if (telefono === null) anotar(plan.notas, "adulto_sin_telefono", n);
        }
      }
    }

    if (apoderadoValido && rutApoderado !== null) {
      filasApoderado.set(rutApoderado, [...(filasApoderado.get(rutApoderado) ?? []), n]);
      const { nombre, apellido } = separarNombre(celda(fila, "apoderado_nombre"));
      const previo = plan.apoderados.get(rutApoderado);
      if (previo === undefined) {
        plan.apoderados.set(rutApoderado, {
          fila: n,
          rut: rutApoderado,
          nombre,
          apellido,
          telefono,
          email,
          metodo_pago: metodoPago,
        });
      } else {
        // Hermanos: el mismo apoderado en varias filas. Se completa lo que faltaba, sin pisar.
        if (previo.nombre === null && nombre !== null) {
          previo.nombre = nombre;
          previo.apellido = apellido;
        }
        previo.telefono ??= telefono;
        previo.email ??= email;
        previo.metodo_pago ??= metodoPago;
      }

      if (jugadorValido && rutJugador !== null) {
        const clave = `${rutJugador}|${rutApoderado}`;
        if (!vinculosVistos.has(clave)) {
          vinculosVistos.add(clave);
          plan.vinculos.push({ fila: n, jugadorRut: rutJugador, apoderadoRut: rutApoderado, paga_mensualidad: false });
        }
      }
    }
  }

  // Un apoderado cuyo RUT es el de un jugador menor (o sin fecha) de cualquier fila, por ejemplo
  // el RUT de un hermano escrito por error, no se carga: entraría al formulario como apoderado.
  for (const rutApoderado of [...plan.apoderados.keys()]) {
    const cargado = plan.jugadores.get(rutApoderado);
    if (cargado === undefined && !omitidosConRut.has(rutApoderado)) continue;
    const fechaJugador = cargado !== undefined ? cargado.fecha_nacimiento : (omitidosConRut.get(rutApoderado) ?? null);
    const esAdulto = fechaJugador !== null && edad(fechaJugador, hoy) >= 18;
    if (esAdulto) continue;
    plan.apoderados.delete(rutApoderado);
    plan.vinculos = plan.vinculos.filter((v) => v.apoderadoRut !== rutApoderado);
    for (const fila of filasApoderado.get(rutApoderado) ?? []) {
      anotar(plan.apoderadosOmitidos, "rut_es_de_un_jugador_menor_o_sin_fecha", fila);
    }
  }

  // El primer apoderado de cada jugador (en el orden de la planilla) es quien paga la mensualidad.
  const conPagador = new Set<string>();
  for (const v of plan.vinculos) {
    v.paga_mensualidad = !conPagador.has(v.jugadorRut);
    conPagador.add(v.jugadorRut);
  }

  for (const j of plan.jugadores.values()) {
    if (!conPagador.has(j.rut) && !adultosPropios.has(j.rut)) anotar(plan.notas, "jugador_sin_apoderado", j.fila);
  }
  for (const a of plan.apoderados.values()) {
    if (a.nombre === null) anotar(plan.camposVacios, "nombre_apoderado_faltante", a.fila);
    const malo = contactoMalo.get(a.rut) ?? {};
    if (a.telefono === null && malo.telefono !== undefined) anotar(plan.camposVacios, "telefono_invalido", malo.telefono);
    if (a.email === null && malo.correo !== undefined) anotar(plan.camposVacios, "correo_invalido", malo.correo);
    if (a.metodo_pago === null && malo.pago !== undefined) anotar(plan.camposVacios, "metodo_pago_ambiguo", malo.pago);
  }
  for (const filas of Object.values(plan.camposVacios)) filas.sort((a, b) => a - b);
  for (const filas of Object.values(plan.apoderadosOmitidos)) filas.sort((a, b) => a - b);
  for (const filas of Object.values(plan.notas)) filas.sort((a, b) => a - b);
  return plan;
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

export type Resumen = {
  dryRun: boolean;
  filas: number;
  filasVacias: number;
  jugadores: { cargados: number; yaExistian: number[]; omitidos: PorMotivo };
  apoderados: { cargados: number; yaExistian: number[]; omitidos: PorMotivo };
  vinculos: { creados: number; omitidos: PorMotivo };
  camposVacios: PorMotivo;
  notas: PorMotivo;
  categoriaDistinta: Record<string, number>;
};

/** Señal para deshacer la transacción del `--dry-run`. */
class Simulacion extends Error {}

/**
 * Escribe el plan en una sola transacción. Lo que ya existe (por RUT) no se toca, y un vínculo
 * solo se crea entre dos personas que se crearon en esta misma corrida. Así, volver a correr el
 * script nunca recrea un vínculo que Mony borró ni cuelga un apoderado de la base a alguien que
 * llegó por el formulario: esos vínculos los aprueba Mony.
 */
export async function importar(db: Db, plan: Plan, opciones: { dryRun: boolean }): Promise<Resumen> {
  const resumen: Resumen = {
    dryRun: opciones.dryRun,
    filas: plan.filas,
    filasVacias: plan.filasVacias,
    jugadores: { cargados: 0, yaExistian: [], omitidos: plan.jugadoresOmitidos },
    apoderados: { cargados: 0, yaExistian: [], omitidos: plan.apoderadosOmitidos },
    vinculos: { creados: 0, omitidos: {} },
    camposVacios: plan.camposVacios,
    notas: plan.notas,
    categoriaDistinta: plan.categoriaDistinta,
  };
  try {
    await db.transaction(async (tx) => {
      await escribir(tx, plan, resumen);
      if (opciones.dryRun) throw new Simulacion("dry-run");
    });
  } catch (error) {
    if (!(error instanceof Simulacion)) throw error;
  }
  return resumen;
}

async function escribir(tx: Ejecutor, plan: Plan, resumen: Resumen) {
  const rutsJugadores = [...plan.jugadores.keys()];
  const rutsApoderados = [...plan.apoderados.keys()];

  const jugadoresExistentes = new Map<string, { id: string }>();
  const jugadoresCreados = new Map<string, string>();
  const apoderadosCreados = new Map<string, string>();
  if (rutsJugadores.length > 0) {
    const existentes = await tx
      .select({ id: jugadores.id, rut: jugadores.rut })
      .from(jugadores)
      .where(inArray(jugadores.rut, rutsJugadores));
    for (const j of existentes) jugadoresExistentes.set(j.rut, j);
  }
  const apoderadosExistentes = new Map<string, { id: string }>();
  if (rutsApoderados.length > 0) {
    const existentes = await tx
      .select({ id: apoderados.id, rut: apoderados.rut })
      .from(apoderados)
      .where(inArray(apoderados.rut, rutsApoderados));
    for (const a of existentes) apoderadosExistentes.set(a.rut, a);
  }

  for (const j of plan.jugadores.values()) {
    if (jugadoresExistentes.has(j.rut)) {
      resumen.jugadores.yaExistian.push(j.fila);
      continue;
    }
    const [creado] = await tx
      .insert(jugadores)
      .values({
        rut: j.rut,
        nombre: j.nombre,
        apellido: j.apellido,
        fecha_nacimiento: j.fecha_nacimiento,
        disciplina: j.disciplina,
        u11f_temporada: j.u11f_temporada,
        postula_beca: j.postula_beca,
        telefono: j.telefono,
        email: j.email,
        metodo_pago: j.metodo_pago,
        // Número de camiseta vacío: no se inventa un 99.
        numero_camiseta: null,
        estado: "precargado",
        origen: "base_2026",
      })
      .returning({ id: jugadores.id });
    if (creado === undefined) throw new Error("insert de jugador sin fila");
    jugadoresCreados.set(j.rut, creado.id);
    resumen.jugadores.cargados++;
  }

  for (const a of plan.apoderados.values()) {
    if (apoderadosExistentes.has(a.rut)) {
      resumen.apoderados.yaExistian.push(a.fila);
      continue;
    }
    const [creado] = await tx
      .insert(apoderados)
      .values({
        rut: a.rut,
        nombre: a.nombre,
        apellido: a.apellido,
        telefono: a.telefono,
        email: a.email,
        metodo_pago: a.metodo_pago,
        estado: "precargado",
        origen: "base_2026",
      })
      .returning({ id: apoderados.id });
    if (creado === undefined) throw new Error("insert de apoderado sin fila");
    apoderadosCreados.set(a.rut, creado.id);
    resumen.apoderados.cargados++;
  }

  for (const v of plan.vinculos) {
    const jugadorId = jugadoresCreados.get(v.jugadorRut);
    const apoderadoId = apoderadosCreados.get(v.apoderadoRut);
    if (jugadorId === undefined || apoderadoId === undefined) {
      // Mony vincula a mano: el resumen trae la fila.
      anotar(resumen.vinculos.omitidos, "persona_ya_existia", v.fila);
      continue;
    }
    await tx
      .insert(jugadorApoderado)
      .values({
        jugador_id: jugadorId,
        apoderado_id: apoderadoId,
        paga_mensualidad: v.paga_mensualidad,
        // Vínculo que trae la base del club: no es un vínculo nuevo que Mony deba aprobar.
        estado: "activo",
        solicitud_id: null,
      });
    resumen.vinculos.creados++;
  }
}

export async function leerCategorias(db: Db): Promise<Categoria[]> {
  return db
    .select({
      id: categorias.id,
      nombre: categorias.nombre,
      disciplina: categorias.disciplina,
      edad_min: categorias.edad_min,
      edad_max: categorias.edad_max,
      se_calcula: categorias.se_calcula,
    })
    .from(categorias);
}

// ---------------------------------------------------------------------------
// Resumen (solo conteos, motivos y números de fila)
// ---------------------------------------------------------------------------

function listarFilas(filas: readonly number[]): string {
  const max = 40;
  const visibles = filas.slice(0, max).join(", ");
  return filas.length > max ? `${visibles}, … (+${filas.length - max})` : visibles;
}

function bloque(titulo: string, registro: PorMotivo): string[] {
  const motivos = Object.entries(registro).sort(([a], [b]) => a.localeCompare(b));
  if (motivos.length === 0) return [`${titulo}: ninguno`];
  return [
    `${titulo}:`,
    ...motivos.map(([motivo, filas]) => `  - ${motivo}: ${filas.length} (filas ${listarFilas(filas)})`),
  ];
}

function categoriasDistintas(distinta: Record<string, number>): string[] {
  const titulo = `Básquet con una categoría en la base distinta de la calculada (temporada ${TEMPORADA_BASE}; no se importa)`;
  const filas = Object.entries(distinta).sort(([a], [b]) => a.localeCompare(b, "es", { numeric: true }));
  if (filas.length === 0) return [`${titulo}: ninguno`];
  const total = filas.reduce((suma, [, n]) => suma + n, 0);
  return [`${titulo}: ${total}`, ...filas.map(([nombre, n]) => `  - ${nombre} en la base: ${n}`)];
}

export function formatearResumen(r: Resumen): string {
  const lineas = [
    r.dryRun
      ? "=== SIMULACIÓN (--dry-run): no se escribió nada ==="
      : "=== IMPORTACIÓN APLICADA ===",
    `Filas con datos: ${r.filas} (vacías ignoradas: ${r.filasVacias})`,
    "",
    `Jugadores cargados: ${r.jugadores.cargados}`,
    `Jugadores que ya existían (no se tocaron): ${r.jugadores.yaExistian.length}${
      r.jugadores.yaExistian.length > 0 ? ` (filas ${listarFilas(r.jugadores.yaExistian)})` : ""
    }`,
    ...bloque("Jugadores omitidos", r.jugadores.omitidos),
    "",
    `Apoderados cargados: ${r.apoderados.cargados}`,
    `Apoderados que ya existían (no se tocaron): ${r.apoderados.yaExistian.length}${
      r.apoderados.yaExistian.length > 0 ? ` (filas ${listarFilas(r.apoderados.yaExistian)})` : ""
    }`,
    ...bloque("Apoderados no cargados", r.apoderados.omitidos),
    "",
    `Vínculos creados: ${r.vinculos.creados}`,
    ...bloque("Vínculos omitidos (Mony los revisa en el panel)", r.vinculos.omitidos),
    "",
    ...bloque("Campos que quedaron vacíos (el formulario los pregunta)", r.camposVacios),
    "",
    ...bloque("Notas", r.notas),
    "",
    ...categoriasDistintas(r.categoriaDistinta),
  ];
  return `${lineas.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// Línea de comandos
// ---------------------------------------------------------------------------

export type Argumentos = {
  archivo: string;
  hoja: string | null;
  columnas: Partial<Record<Campo, string>>;
  dryRun: boolean;
};

const USO =
  "Uso: importar-base-2026.ts <archivo.xlsx> [--hoja <nombre>] [--columna campo=Encabezado] (--dry-run | --aplicar) [--produccion]";

function esCampo(valor: string): valor is Campo {
  return CAMPOS.some((c) => c === valor);
}

export function leerArgumentos(argv: readonly string[]): Argumentos {
  const resultado: Argumentos = { archivo: "", hoja: null, columnas: {}, dryRun: false };
  let aplicar = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--dry-run") resultado.dryRun = true;
    else if (arg === "--aplicar") aplicar = true;
    else if (arg === "--produccion") continue; // Lo lee verificarHostDestino.
    else if (arg === "--hoja") resultado.hoja = argv[++i] ?? null;
    else if (arg === "--columna") {
      const par = argv[++i] ?? "";
      const igual = par.indexOf("=");
      const campo = par.slice(0, igual);
      if (igual <= 0 || !esCampo(campo)) {
        throw new ErrorImportacion(`--columna espera campo=Encabezado, con campo en: ${CAMPOS.join(", ")}`);
      }
      resultado.columnas[campo] = par.slice(igual + 1);
    } else if (arg.startsWith("--")) {
      throw new ErrorImportacion(`Opción desconocida: ${arg}`);
    } else if (resultado.archivo === "") resultado.archivo = arg;
    else throw new ErrorImportacion("Se espera un solo archivo");
  }
  if (resultado.archivo === "") throw new ErrorImportacion(USO);
  // La corrida real es una decisión aparte de la simulación: olvidar --dry-run no escribe.
  if (resultado.dryRun === aplicar) throw new ErrorImportacion(`Indica --dry-run o --aplicar (uno solo). ${USO}`);
  if (resultado.hoja === "") throw new ErrorImportacion("--hoja necesita un nombre");
  return resultado;
}

/** Lee la hoja indicada. Si el archivo tiene varias hojas, exige `--hoja`. */
export async function leerPlanilla(archivo: string, hoja: string | null): Promise<unknown[][]> {
  if (!archivo.toLowerCase().endsWith(".xlsx")) throw new ErrorImportacion("El archivo tiene que ser .xlsx");
  if (!existsSync(archivo)) throw new ErrorImportacion("No se encontró el archivo indicado");
  const hojas = await readSheetNames(archivo);
  if (hoja === null && hojas.length > 1) {
    throw new ErrorImportacion(`El archivo tiene varias hojas; indica cuál con --hoja: ${hojas.join(", ")}`);
  }
  if (hoja !== null && !hojas.includes(hoja)) {
    throw new ErrorImportacion(`No existe la hoja indicada. Hojas: ${hojas.join(", ")}`);
  }
  const filas: unknown[][] = await readXlsxFile(archivo, { sheet: hoja ?? hojas[0] ?? 1 });
  return filas;
}

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const args = leerArgumentos(argv);
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") throw new ErrorImportacion("Falta DATABASE_URL");
  // Antes de leer nada y de conectarse: fuera de localhost exige --produccion.
  try {
    verificarHostDestino(url, argv);
  } catch (error) {
    // El mensaje de la guarda solo nombra el host y la opción --produccion.
    throw new ErrorImportacion(error instanceof Error ? error.message : "DATABASE_URL no válida");
  }
  const filas = await leerPlanilla(args.archivo, args.hoja);
  const { filaEncabezado, columnas } = ubicarColumnas(filas, args.columnas);
  const { db, cerrar } = crearDb(url, { max: 1 });
  try {
    const plan = planificar(filas, columnas, filaEncabezado, await leerCategorias(db), new Date());
    return formatearResumen(await importar(db, plan, { dryRun: args.dryRun }));
  } finally {
    await cerrar();
  }
}

const invocado = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invocado) {
  main(process.argv.slice(2)).then(
    (salida) => {
      process.stdout.write(salida);
    },
    (error: unknown) => {
      // Sin el mensaje de errores ajenos: pueden traer valores de la planilla o de la consulta.
      const detalle =
        error instanceof ErrorImportacion ? error.message : JSON.stringify(resumirError(error));
      process.stderr.write(`La importación no se hizo: ${detalle}\n`);
      process.exitCode = 1;
    },
  );
}
