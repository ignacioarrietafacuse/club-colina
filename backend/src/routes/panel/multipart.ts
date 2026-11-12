import type { FastifyRequest } from "fastify";
import { ErrorApi } from "../../lib/errores";

const archivoInvalido = (mensaje: string) => new ErrorApi(400, "archivo_invalido", mensaje);

/**
 * Lee un multipart del panel: un solo archivo `foto` (obligatorio) y campos de texto. Una foto
 * de más de 2 MB la corta la librería (413 `archivo_invalido`, en `manejarError`).
 */
export async function leerMultipartConFoto(
  request: FastifyRequest,
): Promise<{ foto: Buffer; campos: Record<string, string> }> {
  if (!request.isMultipart()) throw archivoInvalido("Falta la foto.");
  let foto: Buffer | undefined;
  const campos: Record<string, string> = {};
  for await (const parte of request.parts()) {
    if (parte.type === "file") {
      if (parte.fieldname !== "foto" || foto !== undefined) {
        parte.file.resume();
        throw archivoInvalido("Solo se acepta un archivo, en el campo foto.");
      }
      foto = await parte.toBuffer();
    } else if (typeof parte.value === "string") {
      campos[parte.fieldname] = parte.value;
    }
  }
  if (!foto) throw archivoInvalido("Falta la foto.");
  return { foto, campos };
}

/** El campo `datos` de un multipart, como JSON. Si no es JSON válido, 400 `validacion`. */
export function jsonDeCampo(campos: Record<string, string>, nombre: string): unknown {
  const texto = campos[nombre];
  if (texto === undefined) throw new ErrorApi(400, "validacion", `Datos inválidos: ${nombre}`);
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErrorApi(400, "validacion", `Datos inválidos: ${nombre}`);
  }
}
