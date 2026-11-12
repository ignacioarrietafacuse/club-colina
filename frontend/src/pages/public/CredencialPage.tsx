import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VistaCredencial } from "@/components/public/Credencial";
import {
  esNoEncontrado,
  estadoDesdeConsulta,
  tokenConForma,
  VIGENCIA_VERIFICACION_MS,
} from "@/components/public/estados";
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

  const { dataUpdatedAt, refetch } = consulta;

  // Al ocultar la página (teléfono bloqueado, otra app, otra pestaña) la pantalla deja de estar
  // en verde: así lo que queda guardado y se ve al volver nunca es una verificación vieja. Al
  // volver se pregunta de nuevo.
  const [oculta, setOculta] = useState(false);
  const [verificadaAlVolver, setVerificadaAlVolver] = useState(dataUpdatedAt);
  useEffect(() => {
    const ocultar = () => setOculta(true);
    const alCambiar = () => {
      if (document.visibilityState === "hidden") ocultar();
      else void refetch();
    };
    const alMostrar = (e: PageTransitionEvent) => {
      if (e.persisted) void refetch();
    };
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("pagehide", ocultar);
    window.addEventListener("pageshow", alMostrar);
    return () => {
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener("pagehide", ocultar);
      window.removeEventListener("pageshow", alMostrar);
    };
  }, [refetch]);
  if (oculta && dataUpdatedAt !== verificadaAlVolver && document.visibilityState === "visible") {
    // Llegó una respuesta nueva después de volver: vale de nuevo.
    setOculta(false);
    setVerificadaAlVolver(dataUpdatedAt);
  }
  if (!oculta && verificadaAlVolver !== dataUpdatedAt) setVerificadaAlVolver(dataUpdatedAt);

  // Vuelve a dibujar justo cuando vence la verificación, para pasar a "Vuelve a escanear".
  const [, setTic] = useState(0);
  useEffect(() => {
    if (!dataUpdatedAt) return;
    const falta = dataUpdatedAt + VIGENCIA_VERIFICACION_MS - Date.now() + 50;
    const id = setTimeout(() => setTic((n) => n + 1), Math.max(0, falta));
    return () => clearTimeout(id);
  }, [dataUpdatedAt]);

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
    enCurso: consulta.fetchStatus !== "idle" || oculta,
    error,
    datos: consulta.data,
    actualizadaEn: consulta.dataUpdatedAt,
    ahora: Date.now(),
    fotoUrl: api.publico.urlFotoCredencial(token),
  });

  return (
    <Marco>
      <VistaCredencial
        // Cada verificación nueva, o cada vez que vuelve a ser válida, carga la foto desde cero.
        key={`${dataUpdatedAt}-${estado.tipo}`}
        estado={estado}
        onReintentar={conForma ? () => void consulta.refetch() : undefined}
      />
    </Marco>
  );
}
