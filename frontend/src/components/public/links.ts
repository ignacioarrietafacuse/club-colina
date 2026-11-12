import { normalizarBasePublica } from "@/lib/base-publica";

/**
 * Link público del sitio (`/familia/...`, `/completar/...`) con la misma dirección que los QR:
 * `VITE_PUBLIC_BASE_URL`, fijada al compilar. Nunca la del navegador. Devuelve null si la
 * dirección no sirve (el build ya lo impide; esto cubre cualquier otro camino).
 */
export function urlPublica(
  ruta: string,
  base: string | undefined = import.meta.env.VITE_PUBLIC_BASE_URL,
): string | null {
  const valida = normalizarBasePublica(base);
  return valida ? `${valida}${ruta}` : null;
}

/** Si hay una dirección pública válida. El formulario lo revisa antes de enviar. */
export function hayBasePublica(
  base: string | undefined = import.meta.env.VITE_PUBLIC_BASE_URL,
): boolean {
  return urlPublica("/", base) !== null;
}
