import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { mensajeError } from "@/components/public/api";
import { CompletarListo, FormularioCompletar } from "@/components/public/Completar";
import {
  completarTermino,
  esNoEncontrado,
  tituloCompletar,
  tokenConForma,
} from "@/components/public/estados";
import { Aviso, Cargando, Marco } from "@/components/public/Marco";

const LINK_INVALIDO = "Este link no es válido. Pídele uno nuevo a quien te registró o al club.";

/** `/completar/:token`: link personal del segundo apoderado. */
export function CompletarPage() {
  const { token } = useParams({ from: "/completar/$token" });
  const conForma = tokenConForma(token);
  const queryClient = useQueryClient();
  const clave = ["public", "completar", token];
  const consulta = useQuery({
    queryKey: clave,
    queryFn: ({ signal }) => api.publico.verCompletar(token, signal),
    enabled: conForma,
    retry: false,
    // Sin red falla y ofrece reintentar, en vez de quedar cargando.
    networkMode: "always",
  });

  return (
    <Marco titulo={tituloCompletar(consulta.data)}>
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
      ) : completarTermino(consulta.data) ? (
        <CompletarListo datos={consulta.data} />
      ) : (
        <FormularioCompletar
          token={token}
          primerNombre={consulta.data.primer_nombre}
          onSubida={() => void queryClient.invalidateQueries({ queryKey: clave })}
        />
      )}
    </Marco>
  );
}
