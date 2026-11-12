import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, QrCode, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api, mensajeDeError, type TipoPersona } from "@/lib/api";
import { accionesEstado, type Estado } from "./estado";
import { nombreArchivoQr, qrPng, urlDelQr } from "./qr";
import { Button } from "./ui";

/**
 * Credencial de una persona: QR descargable en PNG (solo si está activa y tiene token),
 * regenerar el token, activar y desactivar. Las acciones vuelven a pedir la ficha.
 */
export function Credencial({
  tipo,
  id,
  nombre,
  estado,
  credencialToken,
}: {
  tipo: TipoPersona;
  id: string;
  nombre: string;
  estado: Estado;
  credencialToken: string | null;
}) {
  const queryClient = useQueryClient();
  const [confirmar, setConfirmar] = useState<null | "regenerar" | "desactivar">(null);
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ["panel"] });

  // Solo se muestra el error de la última acción: cada una limpia el de las otras.
  const regenerar = useMutation({
    mutationFn: () => api.panel.regenerarToken(tipo, id),
    onSuccess: refrescar,
  });
  const activar = useMutation({
    mutationFn: () => api.panel.activar(tipo, id),
    onSuccess: refrescar,
  });
  const desactivar = useMutation({
    mutationFn: () => api.panel.desactivar(tipo, id),
    onSuccess: refrescar,
  });
  const ocupado = regenerar.isPending || activar.isPending || desactivar.isPending;
  const error = regenerar.error ?? activar.error ?? desactivar.error;
  const lanzar = (accion: "regenerar" | "activar" | "desactivar") => {
    const objetivo = { regenerar, activar, desactivar }[accion];
    for (const m of [regenerar, activar, desactivar]) if (m !== objetivo) m.reset();
    objetivo.mutate();
  };
  const acciones = accionesEstado(estado);
  const activa = estado === "activo" && credencialToken !== null;

  return (
    <div className="card-surface p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <QrCode className="size-4" /> Credencial
      </div>
      {activa ? (
        <ImagenQr token={credencialToken} nombre={nombre} />
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {estado === "activo"
            ? "Sin credencial: genera una nueva."
            : "La credencial funciona solo cuando la persona está activa."}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {estado === "activo" &&
          (confirmar === "regenerar" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => {
                setConfirmar(null);
                lanzar("regenerar");
              }}
            >
              <RefreshCw className="size-4" /> Sí, el QR anterior deja de servir
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => setConfirmar("regenerar")}
            >
              <RefreshCw className="size-4" /> Regenerar QR
            </Button>
          ))}
        {acciones.activar && (
          <Button size="sm" disabled={ocupado} onClick={() => lanzar("activar")}>
            {estado === "inactivo" ? "Reactivar" : "Activar"}
          </Button>
        )}
        {acciones.desactivar &&
          (confirmar === "desactivar" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => {
                setConfirmar(null);
                lanzar("desactivar");
              }}
            >
              Sí, dejar inactivo
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={ocupado}
              onClick={() => setConfirmar("desactivar")}
            >
              Dejar inactivo
            </Button>
          ))}
        {confirmar && (
          <Button size="sm" variant="ghost" onClick={() => setConfirmar(null)}>
            Cancelar
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {mensajeDeError(error)}
        </p>
      )}
    </div>
  );
}

function ImagenQr({ token, nombre }: { token: string; nombre: string }) {
  const url = urlDelQr(token);
  const [png, setPng] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    setPng(null);
    setFallo(false);
    qrPng(url)
      .then((dato) => vigente && setPng(dato))
      .catch(() => vigente && setFallo(true));
    return () => {
      vigente = false;
    };
  }, [url]);

  if (fallo) return <p className="mt-2 text-sm text-destructive">No se pudo dibujar el QR.</p>;
  if (!png) return <p className="mt-2 text-sm text-muted-foreground">Dibujando el QR…</p>;
  return (
    <div className="mt-3 flex flex-col items-start gap-2">
      <img src={png} alt={`QR de ${nombre}`} className="size-44 rounded-lg border bg-white" />
      <div className="max-w-full break-all font-mono text-[11px] text-muted-foreground">{url}</div>
      <a
        href={png}
        download={nombreArchivoQr(nombre)}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Download className="size-4" /> Descargar PNG
      </a>
    </div>
  );
}
