import type { Usuario } from "@club-colina/shared";
import type { QueryClient } from "@tanstack/react-query";
import { api, ErrorApi } from "@/lib/api";

/** Clave de TanStack Query del usuario con sesión. */
export const CLAVE_SESION = ["sesion"] as const;

/**
 * Usuario con sesión o `null`. Se guarda unos segundos para no preguntar en cada navegación;
 * cualquier 401 de una consulta del panel vacía el caché y vuelve al login (`PanelLayout`).
 */
export function consultarSesion(queryClient: QueryClient): Promise<Usuario | null> {
  return queryClient.fetchQuery({
    queryKey: CLAVE_SESION,
    queryFn: ({ signal }) => api.auth.sesionActual(signal),
    staleTime: 30_000,
  });
}

/** Al salir o al perder la sesión: no queda ningún dato del panel en memoria. */
export function olvidarSesion(queryClient: QueryClient): void {
  queryClient.cancelQueries();
  queryClient.clear();
}

/** La sesión venció o se cerró en otro lado: el servidor responde 401. */
export function esSesionVencida(error: unknown): boolean {
  return error instanceof ErrorApi && error.status === 401;
}
