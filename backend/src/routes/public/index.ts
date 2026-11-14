import type { FastifyInstance } from "fastify";
import { rutasCompletar } from "./completar";
import { rutasCredencial } from "./credencial";
import { rutasFamilia } from "./familia";
import { rutasRutLookup } from "./rut-lookup";
import { rutasSolicitudes } from "./solicitudes";

/**
 * Plugin `public`, montado en /api/public. Lo construye la sesión S2 de la Ola 1.
 * Ninguna respuesta devuelve RUT, teléfono, correo, fechas ni datos de familiares: todas se
 * arman con `respuesta()`, que descarta lo que no esté en el contrato.
 */
export async function rutasPublic(app: FastifyInstance) {
  await app.register(rutasRutLookup);
  await app.register(rutasSolicitudes);
  await app.register(rutasFamilia);
  await app.register(rutasCompletar);
  await app.register(rutasCredencial);
}
