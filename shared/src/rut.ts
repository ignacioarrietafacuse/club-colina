/**
 * RUT chileno. Se guarda siempre como `12345678-9`: sin puntos, con guion y K mayúscula.
 * El formulario y el panel aceptan cualquier forma de escribirlo y lo convierten.
 */

export const RUT_NORMALIZADO = /^[0-9]{7,8}-[0-9K]$/;

/** Dígito verificador (módulo 11) del cuerpo numérico de un RUT. */
export function calcularDv(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/**
 * Convierte cualquier forma de escribir un RUT a `12345678-9`.
 * Devuelve null si el formato no es reconocible o el dígito verificador no calza.
 */
export function normalizarRut(entrada: string): string | null {
  const limpio = entrada.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^[0-9]{7,8}[0-9K]$/.test(limpio)) return null;
  const cuerpo = limpio.slice(0, -1).replace(/^0+/, "");
  const dv = limpio.slice(-1);
  if (cuerpo.length < 7) return null;
  if (calcularDv(cuerpo) !== dv) return null;
  return `${cuerpo}-${dv}`;
}

export function esRutValido(entrada: string): boolean {
  return normalizarRut(entrada) !== null;
}

/**
 * Genera un RUT ficticio con dígito verificador válido, para tests y datos de prueba.
 * Nunca se copian RUT reales. Con `semilla` el resultado es determinístico.
 */
export function generarRutFicticio(semilla?: number): string {
  const aleatorio =
    semilla === undefined ? Math.random() : Math.abs(Math.sin(semilla * 9301 + 49297)) % 1;
  const cuerpo = String(10_000_000 + Math.floor(aleatorio * 15_000_000));
  return `${cuerpo}-${calcularDv(cuerpo)}`;
}
