/**
 * Dirección pública del sitio (la misma que `PUBLIC_BASE_URL` del backend). Va grabada en cada
 * QR, así que no se deduce del navegador: se fija al compilar con `VITE_PUBLIC_BASE_URL`.
 * Hoy https://club-colina.vercel.app; en la Ola 3, https://panel.clubcolina.cl.
 *
 * Sin dependencias: lo usa también `vite.config.ts`.
 */
export const VARIABLE_BASE_PUBLICA = "VITE_PUBLIC_BASE_URL";

/** Base que se usa con `vite` en local cuando no hay variable. Nunca en un build. */
export const BASE_PUBLICA_LOCAL = "http://localhost:5173";

/**
 * Valida y normaliza la dirección: solo origen (sin ruta, consulta ni barra final), https salvo
 * localhost. Devuelve `null` si no sirve.
 */
export function normalizarBasePublica(valor: string | undefined): string | null {
  if (!valor) return null;
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

/**
 * Para `vite.config.ts`: en un build la variable es obligatoria y válida (si no, el build
 * falla); con el servidor de desarrollo, sin variable se usa localhost.
 */
export function basePublicaParaVite(valor: string | undefined, esBuild: boolean): string {
  const base = normalizarBasePublica(valor);
  if (base) return base;
  if (!esBuild && !valor) return BASE_PUBLICA_LOCAL;
  throw new Error(
    `${VARIABLE_BASE_PUBLICA} ${valor ? "no es válida" : "no está definida"}: tiene que ser el ` +
      "origen público del sitio con https (por ejemplo https://club-colina.vercel.app). " +
      "Va grabada en los QR; el build no sigue sin ella.",
  );
}
