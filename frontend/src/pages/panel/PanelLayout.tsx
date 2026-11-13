import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/panel/AppShell";
import type { Usuario } from "@club-colina/shared";
import { api } from "@/lib/api";
import { RUTA_CAMBIAR_CLAVE } from "./guarda";
import { CLAVE_AVISO_SUSCRIPCION, DURACION_AVISO_MS } from "./suscripcion";
import { CLAVE_SESION, cerrarSesion, olvidarSesion, vigilarSesion } from "./sesion";

export function PanelLayout() {
  const { usuario } = useRouteContext({ from: "/_panel" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Cualquier consulta o acción del panel que reciba 401 cierra la sesión en pantalla.
  useEffect(
    () =>
      vigilarSesion(
        queryClient,
        () => {
          // La sesión guardada se borra ya (la guarda no deja pasar con ella); el resto, al salir
          // de las páginas del panel, para que nada vuelva a pedir datos. Aunque navegar falle.
          queryClient.removeQueries({ queryKey: CLAVE_SESION });
          void navigate({ to: "/login" }).finally(() => olvidarSesion(queryClient));
        },
        () => {
          // La marca se puso con la sesión abierta: la guarda la ve en la sesión guardada y deja
          // solo la pantalla de cambiar clave.
          queryClient.setQueryData<Usuario | null>(
            CLAVE_SESION,
            (u) => u && { ...u, debe_cambiar_clave: true },
          );
          void navigate({ to: RUTA_CAMBIAR_CLAVE });
        },
      ),
    [queryClient, navigate],
  );

  // Aviso global de cobro fallido de la suscripción. El backend lo guarda 15 minutos; si falla, no
  // hay aviso (el pago nunca bloquea el panel).
  const aviso = useQuery({
    queryKey: CLAVE_AVISO_SUSCRIPCION,
    queryFn: ({ signal }) => api.suscripcion.aviso(signal),
    enabled: !usuario.debe_cambiar_clave,
    staleTime: DURACION_AVISO_MS,
    retry: false,
  });

  const salir = useMutation({
    mutationFn: () => cerrarSesion(queryClient),
    onSuccess: () => navigate({ to: "/login" }),
  });

  return (
    <AppShell
      nombreUsuario={usuario.nombre}
      soloCambiarClave={usuario.debe_cambiar_clave}
      avisoCobroFallido={aviso.data?.cobro_fallido === true}
      onSalir={() => salir.mutate()}
      saliendo={salir.isPending}
      errorSalir={
        salir.isError
          ? "No se pudo cerrar la sesión: sigue abierta. Vuelve a intentarlo."
          : undefined
      }
    >
      <Outlet />
    </AppShell>
  );
}
