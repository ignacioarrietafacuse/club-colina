import type { Usuario } from "@club-colina/shared";
import type { QueryClient } from "@tanstack/react-query";
import { api, ErrorApi, reintentar } from "@/lib/api";

/** Clave de TanStack Query del usuario con sesión. */
export const CLAVE_SESION = ["sesion"] as const;
/** Toda consulta del panel lleva una clave que empieza así. */
export const PREFIJO_PANEL = "panel";

/**
 * Usuario con sesión o `null`. Se guarda unos segundos para no preguntar en cada navegación;
 * cualquier 401 de una consulta del panel vacía el caché y vuelve al login (`vigilarSesion`).
 */
export function consultarSesion(queryClient: QueryClient): Promise<Usuario | null> {
  // Las consultas del panel no reintentan un 4xx: un 401 se ve al primer intento.
  queryClient.setQueryDefaults([PREFIJO_PANEL], { retry: reintentar });
  return queryClient.fetchQuery({
    queryKey: CLAVE_SESION,
    queryFn: ({ signal }) => api.auth.sesionActual(signal),
    staleTime: 30_000,
  });
}

/** Al salir o al perder la sesión: no queda ningún dato del panel en memoria. */
export function olvidarSesion(queryClient: QueryClient): void {
  void queryClient.cancelQueries();
  queryClient.clear();
}

/** La sesión venció o se cerró en otro lado: el servidor responde 401. */
export function esSesionVencida(error: unknown): boolean {
  return error instanceof ErrorApi && error.status === 401;
}

/**
 * Llama a `alVencer` una sola vez cuando una consulta o acción recibe 401 (aunque varias fallen
 * a la vez). Devuelve la función para dejar de vigilar.
 */
export function vigilarSesion(queryClient: QueryClient, alVencer: () => void): () => void {
  let avisado = false;
  const avisar = (error: unknown) => {
    if (avisado || !esSesionVencida(error)) return;
    avisado = true;
    alVencer();
  };
  const sinConsultas = queryClient.getQueryCache().subscribe((evento) => {
    if (evento.type === "updated") avisar(evento.query.state.error);
  });
  const sinAcciones = queryClient.getMutationCache().subscribe((evento) => {
    if (evento.type === "updated") avisar(evento.mutation.state.error);
  });
  return () => {
    sinConsultas();
    sinAcciones();
  };
}

/**
 * Cierra la sesión en el servidor. Solo si el servidor la cerró (o ya no existía: 401) se borra
 * lo cargado. Si falla, se lanza el error y la pantalla lo dice: la cookie es httpOnly y solo el
 * servidor la anula, así que fingir que se salió dejaría la sesión abierta en ese navegador.
 */
export async function cerrarSesion(queryClient: QueryClient): Promise<void> {
  try {
    await api.auth.logout();
  } catch (error) {
    if (!esSesionVencida(error)) throw error;
  }
  olvidarSesion(queryClient);
}
