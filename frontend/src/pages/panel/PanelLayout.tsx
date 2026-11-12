import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Outlet, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/panel/AppShell";
import { api } from "@/lib/api";
import { esSesionVencida, olvidarSesion } from "./sesion";

export function PanelLayout() {
  const { usuario } = useRouteContext({ from: "/_panel" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Cualquier consulta o acción del panel que reciba 401 cierra la sesión en pantalla.
  useEffect(() => {
    const alLogin = () => {
      olvidarSesion(queryClient);
      void navigate({ to: "/login" });
    };
    const desuscribirConsultas = queryClient.getQueryCache().subscribe((evento) => {
      if (evento.type === "updated" && esSesionVencida(evento.query.state.error)) alLogin();
    });
    const desuscribirAcciones = queryClient.getMutationCache().subscribe((evento) => {
      if (evento.type === "updated" && esSesionVencida(evento.mutation.state.error)) alLogin();
    });
    return () => {
      desuscribirConsultas();
      desuscribirAcciones();
    };
  }, [queryClient, navigate]);

  const salir = useMutation({
    mutationFn: () => api.auth.logout(),
    // Aunque el servidor falle, en este navegador no queda nada del panel.
    onSettled: async () => {
      olvidarSesion(queryClient);
      await navigate({ to: "/login" });
    },
  });

  return (
    <AppShell
      nombreUsuario={usuario.nombre}
      onSalir={() => salir.mutate()}
      saliendo={salir.isPending}
    >
      <Outlet />
    </AppShell>
  );
}
