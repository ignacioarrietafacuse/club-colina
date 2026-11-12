import QRCode from "qrcode";
import { normalizarBasePublica } from "@/lib/base-publica";
import { urlQrCredencial } from "@/lib/credencial";

/**
 * QR de una credencial como imagen PNG (data URL). La URL grabada sale de `VITE_PUBLIC_BASE_URL`
 * (fijada al compilar), nunca del navegador: abierta desde una vista previa o un alias, igual
 * graba la dirección pública. `base` es solo para los tests.
 */
export function qrCredencial(credencialToken: string, base?: string): Promise<string> {
  return QRCode.toDataURL(urlQrCredencial(credencialToken, base), {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
}

/** Link público del sitio (`/familia/...`, `/completar/...`) con la misma dirección que los QR. */
export function urlPublica(
  ruta: string,
  base: string | undefined = import.meta.env.VITE_PUBLIC_BASE_URL,
): string {
  const valida = normalizarBasePublica(base);
  if (!valida) throw new Error("Falta la dirección pública del sitio (VITE_PUBLIC_BASE_URL).");
  return `${valida}${ruta}`;
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
