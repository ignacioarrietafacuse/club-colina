import QRCode from "qrcode";
import { urlQrCredencial } from "@/lib/credencial";

/**
 * QR de una credencial como imagen PNG (data URL). La URL grabada sale de `VITE_PUBLIC_BASE_URL`
 * (fijada al compilar), nunca del navegador: abierta desde una vista previa o un alias, igual
 * graba la dirección pública. `base` es solo para los tests.
 */
// async: si falta la dirección, `urlQrCredencial` lanza y eso tiene que ser una promesa
// rechazada (CodigoQr muestra su aviso), no un error que tumbe la página entera.
export async function qrCredencial(credencialToken: string, base?: string): Promise<string> {
  return QRCode.toDataURL(urlQrCredencial(credencialToken, base), {
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
