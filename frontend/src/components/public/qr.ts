import { urlCredencial } from "@club-colina/shared";
import QRCode from "qrcode";

/**
 * QR de una credencial como imagen PNG (data URL). `baseUrl` es el origen donde se abrió la
 * página: en el dominio de producción coincide con PUBLIC_BASE_URL, pero abierta desde una
 * vista previa o un alias de Vercel grabaría ese otro dominio.
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
