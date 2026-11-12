import {
  apoderadoPatch,
  jugadorPatch,
  normalizarRut,
  type ApoderadoDetalle,
  type ApoderadoPatch,
  type JugadorDetalle,
  type JugadorPatch,
} from "@club-colina/shared";
import type { z } from "zod";

/**
 * Formularios de las fichas. Todo va como texto mientras Mony escribe; al guardar se envía solo
 * lo que cambió (PATCH parcial), validado con el esquema del contrato.
 */

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

const NOMBRES: Record<string, string> = {
  nombre: "nombre",
  apellido: "apellido",
  rut: "RUT",
  fecha_nacimiento: "fecha de nacimiento",
  disciplina: "disciplina",
  categoria_id: "categoría",
  numero_camiseta: "número de camiseta",
  postula_beca: "postula a beca",
  beca_mensualidad_pct: "beca de mensualidad",
  beca_torneos_pct: "beca de torneos",
  beca_campus_pct: "beca de campus",
  telefono: "teléfono",
  email: "correo",
  metodo_pago: "método de pago",
};

const texto = (v: string | number | null) => (v === null ? "" : String(v));

/** Texto → entero, o NaN si no es un entero escrito tal cual (así el esquema lo rechaza). */
function entero(t: string): number {
  const limpio = t.trim();
  return /^-?[0-9]+$/.test(limpio) ? Number(limpio) : Number.NaN;
}

/** Dígitos de un teléfono como los deja el contrato (9, sin +56), para comparar. */
function digitosTelefono(t: string): string {
  const d = t.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("56") ? d.slice(2) : d;
}

function validar<E extends z.ZodType>(
  esquema: E,
  datos: Record<string, unknown>,
): Resultado<z.output<E>> {
  if (Object.keys(datos).length === 0)
    return { ok: false, errores: ["No hay cambios que guardar."] };
  const leido = esquema.safeParse(datos);
  if (leido.success) return { ok: true, datos: leido.data };
  const campos = new Set(
    leido.error.issues.map((i) => {
      const c = i.path[0];
      return typeof c === "string" ? (NOMBRES[c] ?? c) : "datos";
    }),
  );
  return { ok: false, errores: [...campos].map((c) => `Revisa ${c}.`) };
}

/**
 * Agrega `campo` al PATCH solo si cambió. Un texto vacío en un campo que admite null lo borra;
 * en uno obligatorio, si antes estaba vacío, no es un cambio.
 */
function siCambia(
  datos: Record<string, unknown>,
  campo: string,
  nuevo: string,
  original: string | number | null,
  convertir: (t: string) => unknown,
  { anulable, igual }: { anulable: boolean; igual?: (a: string, b: string) => boolean },
) {
  const limpio = nuevo.trim();
  const antes = texto(original);
  const mismo = igual ? igual(limpio, antes) : limpio === antes;
  if (mismo) return;
  if (limpio === "") {
    if (anulable) datos[campo] = null;
    else if (antes !== "") datos[campo] = "";
    return;
  }
  datos[campo] = convertir(limpio);
}

const mismoRut = (a: string, b: string) => normalizarRut(a) === b;
const mismoTelefono = (a: string, b: string) => digitosTelefono(a) === b;
const mismoEmail = (a: string, b: string) => a.toLowerCase() === b;
const id = (t: string) => t;

// --- Jugador ---------------------------------------------------------------

export interface FormJugadorFicha {
  nombre: string;
  apellido: string;
  rut: string;
  fecha_nacimiento: string;
  disciplina: string;
  categoria_id: string;
  numero_camiseta: string;
  postula_beca: boolean;
  beca_mensualidad_pct: string;
  beca_torneos_pct: string;
  beca_campus_pct: string;
  telefono: string;
  email: string;
  metodo_pago: string;
}

export function formJugador(j: JugadorDetalle): FormJugadorFicha {
  return {
    nombre: texto(j.nombre),
    apellido: texto(j.apellido),
    rut: j.rut,
    fecha_nacimiento: texto(j.fecha_nacimiento),
    disciplina: j.disciplina,
    categoria_id: texto(j.categoria_id),
    numero_camiseta: texto(j.numero_camiseta),
    postula_beca: j.postula_beca,
    beca_mensualidad_pct: String(j.beca_mensualidad_pct),
    beca_torneos_pct: String(j.beca_torneos_pct),
    beca_campus_pct: String(j.beca_campus_pct),
    telefono: texto(j.telefono),
    email: texto(j.email),
    metodo_pago: texto(j.metodo_pago),
  };
}

export function cambiosJugador(j: JugadorDetalle, f: FormJugadorFicha): Resultado<JugadorPatch> {
  const d: Record<string, unknown> = {};
  siCambia(d, "nombre", f.nombre, j.nombre, id, { anulable: false });
  siCambia(d, "apellido", f.apellido, j.apellido, id, { anulable: false });
  siCambia(d, "rut", f.rut, j.rut, id, { anulable: false, igual: mismoRut });
  siCambia(d, "fecha_nacimiento", f.fecha_nacimiento, j.fecha_nacimiento, id, { anulable: true });
  siCambia(d, "disciplina", f.disciplina, j.disciplina, id, { anulable: false });
  siCambia(d, "categoria_id", f.categoria_id, j.categoria_id, entero, { anulable: true });
  siCambia(d, "numero_camiseta", f.numero_camiseta, j.numero_camiseta, id, { anulable: true });
  if (f.postula_beca !== j.postula_beca) d.postula_beca = f.postula_beca;
  siCambia(d, "beca_mensualidad_pct", f.beca_mensualidad_pct, j.beca_mensualidad_pct, entero, {
    anulable: false,
  });
  siCambia(d, "beca_torneos_pct", f.beca_torneos_pct, j.beca_torneos_pct, entero, {
    anulable: false,
  });
  siCambia(d, "beca_campus_pct", f.beca_campus_pct, j.beca_campus_pct, entero, { anulable: false });
  siCambia(d, "telefono", f.telefono, j.telefono, id, { anulable: true, igual: mismoTelefono });
  siCambia(d, "email", f.email, j.email, id, { anulable: true, igual: mismoEmail });
  siCambia(d, "metodo_pago", f.metodo_pago, j.metodo_pago, id, { anulable: true });
  return validar(jugadorPatch, d);
}

// --- Apoderado -------------------------------------------------------------

export interface FormApoderadoFicha {
  nombre: string;
  apellido: string;
  rut: string;
  telefono: string;
  email: string;
  metodo_pago: string;
}

export function formApoderado(a: ApoderadoDetalle): FormApoderadoFicha {
  return {
    nombre: texto(a.nombre),
    apellido: texto(a.apellido),
    rut: a.rut,
    telefono: texto(a.telefono),
    email: texto(a.email),
    metodo_pago: texto(a.metodo_pago),
  };
}

export function cambiosApoderado(
  a: ApoderadoDetalle,
  f: FormApoderadoFicha,
): Resultado<ApoderadoPatch> {
  const d: Record<string, unknown> = {};
  siCambia(d, "nombre", f.nombre, a.nombre, id, { anulable: false });
  siCambia(d, "apellido", f.apellido, a.apellido, id, { anulable: false });
  siCambia(d, "rut", f.rut, a.rut, id, { anulable: false, igual: mismoRut });
  siCambia(d, "telefono", f.telefono, a.telefono, id, { anulable: true, igual: mismoTelefono });
  siCambia(d, "email", f.email, a.email, id, { anulable: true, igual: mismoEmail });
  siCambia(d, "metodo_pago", f.metodo_pago, a.metodo_pago, id, { anulable: true });
  return validar(apoderadoPatch, d);
}
