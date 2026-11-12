import { urlCredencial } from "@club-colina/shared";
import QRCode from "qrcode";

/**
 * Base de la URL que va dentro del QR. El panel se sirve desde la misma dirección pública que
 * `PUBLIC_BASE_URL` (hoy club-colina.vercel.app; en la Ola 3, panel.clubcolina.cl), así que se
 * toma del navegador. La URL completa se muestra bajo el QR para que se vea qué queda grabado.
 */
export function baseActual(): string {
  return window.location.origin;
}

export function urlDelQr(credencialToken: string, base = baseActual()): string {
  return urlCredencial(base, credencialToken);
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
