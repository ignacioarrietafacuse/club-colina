import { useEffect, useState } from "react";
import { nombreArchivoQr, qrCredencial } from "./qr";

/** QR de una credencial activa, con botón para descargarlo en PNG. */
export function CodigoQr({
  baseUrl,
  credencialToken,
  nombreCompleto,
}: {
  baseUrl: string;
  credencialToken: string;
  nombreCompleto: string;
}) {
  const [png, setPng] = useState<string | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vigente = true;
    setPng(null);
    setFallo(false);
    qrCredencial(baseUrl, credencialToken).then(
      (url) => vigente && setPng(url),
      () => vigente && setFallo(true),
    );
    return () => {
      vigente = false;
    };
  }, [baseUrl, credencialToken]);

  if (fallo) return <p className="text-sm text-destructive">No pudimos dibujar el código QR.</p>;
  if (!png) return <div className="aspect-square w-48 animate-pulse rounded-lg bg-muted" />;
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={png}
        alt={`Código QR de ${nombreCompleto}`}
        className="aspect-square w-48 rounded-lg border"
      />
      <a
        href={png}
        download={nombreArchivoQr(nombreCompleto)}
        className="text-sm font-medium text-secondary underline underline-offset-4"
      >
        Descargar imagen
      </a>
    </div>
  );
}
