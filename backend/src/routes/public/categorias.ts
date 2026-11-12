import { categoriasPublicasResponse } from "@club-colina/shared";
import { asc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { categorias } from "../../db/schema";
import { LIMITES } from "../../lib/limite-intentos";
import { respuesta } from "../../lib/validar";

/** GET /api/public/categorias — para cuando el formulario tiene que preguntar la categoría. */
export async function rutasCategorias(app: FastifyInstance) {
  app.get("/categorias", { config: { rateLimit: LIMITES.publicoLectura } }, async () => {
    const filas = await app.db
      .select({ id: categorias.id, nombre: categorias.nombre, disciplina: categorias.disciplina })
      .from(categorias)
      .orderBy(asc(categorias.disciplina), asc(categorias.anio_desde), asc(categorias.id));
    return respuesta(categoriasPublicasResponse, filas);
  });
}
