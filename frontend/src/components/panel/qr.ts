import QRCode from "qrcode";
import { urlQrCredencial } from "@/lib/credencial";

/**
 * URL que va dentro del QR: la dirección pública fijada al compilar (`VITE_PUBLIC_BASE_URL`),
 * nunca la del navegador. La URL completa se muestra bajo el QR para que se vea qué queda grabado.
 */
export function urlDelQr(credencialToken: string, base?: string): string {
  return urlQrCredencial(credencialToken, base);
}

/** PNG como data URL (la CSP permite `img-src data:`). Se genera en el navegador. */
export function qrPng(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 768, margin: 2, errorCorrectionLevel: "M" });
}

/** Nombre del archivo: sin tildes ni espacios, sin datos más allá del nombre. */
export function nombreArchivoQr(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `qr-${limpio || "credencial"}.png`;
}
