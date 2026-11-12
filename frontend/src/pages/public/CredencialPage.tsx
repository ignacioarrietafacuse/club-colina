import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { api } from "@/lib/api";
import { VistaCredencial, type EstadoCredencial } from "@/components/public/Credencial";
import { esNoEncontrado, tokenConForma } from "@/components/public/estados";
import { Marco } from "@/components/public/Marco";

/** `/c/:token`: lo que abre la cámara de quien controla la entrada al escanear un QR. */
export function CredencialPage() {
  const { token } = useParams({ from: "/c/$token" });
  const conForma = tokenConForma(token);
  const consulta = useQuery({
    queryKey: ["public", "credencial", token],
    queryFn: ({ signal }) => api.publico.credencial(token, signal),
    enabled: conForma,
    retry: false,
    // Siempre se pregunta de nuevo: una credencial se puede desactivar en cualquier momento.
    staleTime: 0,
    gcTime: 0,
  });

  let estado: EstadoCredencial;
  if (!conForma) estado = { tipo: "no_valida" };
  else if (consulta.isPending) estado = { tipo: "cargando" };
  else if (consulta.isError)
    estado = esNoEncontrado(consulta.error) ? { tipo: "no_valida" } : { tipo: "error" };
  else
    estado = {
      tipo: "valida",
      datos: consulta.data,
      fotoUrl: api.publico.urlFotoCredencial(token),
    };

  return (
    <Marco>
      <VistaCredencial estado={estado} />
    </Marco>
  );
}
