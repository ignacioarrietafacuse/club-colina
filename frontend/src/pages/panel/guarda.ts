import type { Usuario } from "@club-colina/shared";
import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { consultarSesion, olvidarSesion } from "./sesion";

/**
 * Guarda de las rutas del panel. Denegar por defecto: deja pasar solo si `GET /api/auth/me`
 * responde 200 con un usuario. Sin sesión (401) o ante cualquier error (red, 500, respuesta
 * fuera de contrato), redirige a /login.
 */
export async function guardaPanel({
  context,
}: {
  context: { queryClient: QueryClient };
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
  return { usuario };
}
