import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { mensajeError } from "@/components/public/api";
import { esNoEncontrado, tokenConForma } from "@/components/public/estados";
import { VistaFamilia } from "@/components/public/Familia";
import { Aviso, Cargando, Marco } from "@/components/public/Marco";

const LINK_INVALIDO = "Este link no es válido. Si lo perdiste, pídele uno nuevo al club.";

/** `/familia/:token`: link privado de quien se registró. */
export function FamiliaPage() {
  const { token } = useParams({ from: "/familia/$token" });
  const conForma = tokenConForma(token);
  const consulta = useQuery({
    queryKey: ["public", "familia", token],
    queryFn: ({ signal }) => api.publico.familia(token, signal),
    enabled: conForma,
    retry: false,
    // Sin red falla y ofrece reintentar, en vez de quedar cargando.
    networkMode: "always",
  });

  return (
    <Marco titulo="Tu registro">
      {!conForma ? (
        <Aviso tono="error">{LINK_INVALIDO}</Aviso>
      ) : consulta.isPending ? (
        <Cargando />
      ) : consulta.isError ? (
        esNoEncontrado(consulta.error) ? (
          <Aviso tono="error">{LINK_INVALIDO}</Aviso>
        ) : (
          <div className="space-y-3">
            <Aviso tono="error">{mensajeError(consulta.error)}</Aviso>
            <Button
              variant="outline"
              disabled={consulta.isFetching}
              onClick={() => void consulta.refetch()}
            >
              {consulta.isFetching ? "Reintentando…" : "Reintentar"}
            </Button>
          </div>
        )
      ) : (
        <VistaFamilia datos={consulta.data} baseUrl={window.location.origin} />
      )}
    </Marco>
  );
}
