import { urlCredencial } from "@club-colina/shared";
import { normalizarBasePublica } from "./base-publica";

/**
 * URL que va dentro del QR de una credencial. Úsenla el panel (S4) y las páginas públicas (S5)
 * para dibujar cualquier QR: nunca `window.location`, que en otra dirección (una vista previa,
 * el dominio viejo) grabaría una URL equivocada en un QR que ya se repartió.
 */
export function urlQrCredencial(
  credencialToken: string,
  base: string | undefined = import.meta.env.VITE_PUBLIC_BASE_URL,
): string {
  const valida = normalizarBasePublica(base);
  // vite.config.ts ya hace fallar el build sin la variable; esto cubre cualquier otro camino.
  if (!valida) throw new Error("Falta la dirección pública del sitio (VITE_PUBLIC_BASE_URL).");
  return urlCredencial(valida, credencialToken);
}
