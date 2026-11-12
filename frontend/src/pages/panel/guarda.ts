import type { Usuario } from "@club-colina/shared";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { consultarSesion, olvidarSesion } from "./sesion";

/**
 * Guarda de las rutas del panel. Denegar por defecto: deja pasar solo si `GET /api/auth/me`
 * responde 200 con un usuario. Sin sesión (401) o ante cualquier error (red, 500, respuesta
 * fuera de contrato), redirige a /login. Un usuario con clave temporal (`debe_cambiar_clave`) solo
 * puede estar en /cambiar-clave: cualquier otra ruta del panel lo manda ahí.
 */
export const RUTA_CAMBIAR_CLAVE = "/cambiar-clave";

export async function guardaPanel({
  context,
  location,
}: {
  context: { queryClient: QueryClient };
  location?: { pathname: string };
}): Promise<{ usuario: Usuario }> {
  let usuario: Usuario | null = null;
  try {
    usuario = await consultarSesion(context.queryClient);
  } catch {
    usuario = null;
  }
  if (!usuario) {
    // Lo que haya quedado de una sesión anterior no sobrevive al login de otra persona.
    olvidarSesion(context.queryClient);
    throw redirect({ to: "/login" });
  }
  if (usuario.debe_cambiar_clave && location?.pathname !== RUTA_CAMBIAR_CLAVE) {
    throw redirect({ to: RUTA_CAMBIAR_CLAVE });
  }
  return { usuario };
}
