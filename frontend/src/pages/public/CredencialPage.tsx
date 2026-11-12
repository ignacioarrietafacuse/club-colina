import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VistaCredencial } from "@/components/public/Credencial";
import { esNoEncontrado, estadoDesdeConsulta, tokenConForma } from "@/components/public/estados";
import { Marco } from "@/components/public/Marco";
import { statusDe } from "@/components/public/api";

/** `/c/:token`: lo que abre la cámara de quien controla la entrada al escanear un QR. */
export function CredencialPage() {
  const { token } = useParams({ from: "/c/$token" });
  const conForma = tokenConForma(token);
  const consulta = useQuery({
    queryKey: ["public", "credencial", token],
    queryFn: ({ signal }) => api.publico.credencial(token, signal),
    enabled: conForma,
    retry: false,
    // Sin red la consulta falla en vez de quedar en pausa mostrando datos viejos.
    networkMode: "always",
    // Siempre se pregunta de nuevo: una credencial se puede desactivar en cualquier momento.
    staleTime: 0,
    gcTime: 0,
  });

  // Para que una pantalla que quedó abierta pase a "Vuelve a escanear".
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  const error = consulta.isError
    ? esNoEncontrado(consulta.error)
      ? "no_encontrado"
      : statusDe(consulta.error) === 429
        ? "demasiados_intentos"
        : "otro"
    : null;
  const estado = estadoDesdeConsulta({
    conForma,
    pendiente: consulta.isPending,
    enCurso: consulta.fetchStatus !== "idle",
    error,
    datos: consulta.data,
    actualizadaEn: consulta.dataUpdatedAt,
    ahora: Math.max(ahora, consulta.dataUpdatedAt),
    fotoUrl: api.publico.urlFotoCredencial(token),
  });

  return (
    <Marco>
      <VistaCredencial
        // Cada verificación nueva vuelve a cargar la foto desde cero.
        key={consulta.dataUpdatedAt}
        estado={estado}
        onReintentar={conForma ? () => void consulta.refetch() : undefined}
      />
    </Marco>
  );
}
