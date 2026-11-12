import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/panel/AppShell";
import { CLAVE_SESION, cerrarSesion, olvidarSesion, vigilarSesion } from "./sesion";

export function PanelLayout() {
  const { usuario } = useRouteContext({ from: "/_panel" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Cualquier consulta o acción del panel que reciba 401 cierra la sesión en pantalla.
  useEffect(
    () =>
      vigilarSesion(queryClient, () => {
        // La sesión guardada se borra ya (la guarda no deja pasar con ella); el resto, al salir
        // de las páginas del panel, para que nada vuelva a pedir datos. Aunque navegar falle.
        queryClient.removeQueries({ queryKey: CLAVE_SESION });
        void navigate({ to: "/login" }).finally(() => olvidarSesion(queryClient));
      }),
    [queryClient, navigate],
  );

  const salir = useMutation({
    mutationFn: () => cerrarSesion(queryClient),
    onSuccess: () => navigate({ to: "/login" }),
  });

  return (
    <AppShell
      nombreUsuario={usuario.nombre}
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
