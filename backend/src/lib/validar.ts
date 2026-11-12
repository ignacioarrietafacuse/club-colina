import type { z } from "zod";
import { camposConError, ErrorApi } from "./errores";

/**
 * Valida lo que manda el cliente (body, params, query, campos de multipart) con un esquema
 * de shared/. Si no cumple: 400 `validacion` con los nombres de los campos, nunca los valores.
 */
export function validarEntrada<T extends z.ZodType>(esquema: T, datos: unknown): z.output<T> {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    throw new ErrorApi(400, "validacion", `Datos inválidos: ${camposConError(resultado.error).join(", ")}`);
  }
  return resultado.data;
}

/**
 * Arma una respuesta pasándola por su esquema de shared/. Los z.object descartan cualquier
 * campo que no esté en el contrato, así una columna de más (RUT, teléfono, fechas) nunca
 * sale por la API. Si los datos no cumplen el contrato es un error del servidor (500).
 * Toda respuesta pública se arma con esto.
 */
export function respuesta<T extends z.ZodType>(esquema: T, datos: z.input<T>): z.output<T> {
  return esquema.parse(datos);
}
