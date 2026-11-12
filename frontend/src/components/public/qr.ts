import { urlCredencial } from "@club-colina/shared";
import QRCode from "qrcode";

/**
 * QR de una credencial como imagen PNG (data URL). La URL que va grabada es la del sitio
 * donde se abrió la página: en producción, la misma que PUBLIC_BASE_URL.
 */
export function qrCredencial(baseUrl: string, credencialToken: string): Promise<string> {
  return QRCode.toDataURL(urlCredencial(baseUrl, credencialToken), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
}

/** Nombre del archivo PNG al descargar un QR. Sin tildes ni espacios. */
export function nombreArchivoQr(nombreCompleto: string): string {
  const base = nombreCompleto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `credencial-${base || "club-colina"}.png`;
}
