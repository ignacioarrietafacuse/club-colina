import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/panel/AppShell";
import { cerrarSesion, olvidarSesion, vigilarSesion } from "./sesion";

export function PanelLayout() {
  const { usuario } = useRouteContext({ from: "/_panel" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Cualquier consulta o acción del panel que reciba 401 cierra la sesión en pantalla.
  useEffect(
    () =>
      vigilarSesion(queryClient, () => {
        // Primero se sale de las páginas del panel, para que nada vuelva a pedir datos.
        void navigate({ to: "/login" }).then(() => olvidarSesion(queryClient));
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
          ? "No se pudo cerrar la sesión. Vuelve a intentarlo o cierra el navegador."
          : undefined
      }
    >
      <Outlet />
    </AppShell>
  );
}
