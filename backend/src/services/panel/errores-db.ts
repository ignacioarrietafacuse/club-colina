import { ErrorApi } from "../../lib/errores";

/** Código SQLSTATE de un error de Postgres, venga directo o envuelto por drizzle (`cause`). */
export function codigoPostgres(error: unknown): string | undefined {
  for (let actual: unknown = error, i = 0; actual && i < 3; i++) {
    if (typeof actual === "object" && actual !== null) {
      const codigo: unknown = Reflect.get(actual, "code");
      if (typeof codigo === "string" && /^[0-9A-Z]{5}$/.test(codigo)) return codigo;
      actual = Reflect.get(actual, "cause");
    } else {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Traduce las restricciones de la base a respuestas del contrato, sin repetir valores:
 * - 23505 (único): el RUT (o el token) ya existe → 409 `conflicto`.
 * - 23514 (CHECK): la ficha quedaría incompleta para su estado → 422 `requisitos_incompletos`.
 * - 23503 (llave foránea): apunta a algo que no existe (una categoría) → 400 `validacion`.
 * Cualquier otro error sigue su camino (500).
 */
export async function conRestricciones<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const codigo = codigoPostgres(error);
    if (codigo === "23505") throw new ErrorApi(409, "conflicto", "Ya existe una ficha con ese RUT");
    if (codigo === "23514") {
      throw new ErrorApi(422, "requisitos_incompletos", "La ficha quedaría incompleta para su estado");
    }
    if (codigo === "23503") throw new ErrorApi(400, "validacion", "Datos inválidos: referencia inexistente");
    throw error;
  }
}
