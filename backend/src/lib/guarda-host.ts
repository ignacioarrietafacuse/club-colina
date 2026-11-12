const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Guarda de los scripts que escriben (importación, crear usuario, migraciones manuales):
 * se niegan a correr contra un host que no sea localhost, salvo con `--produccion`, que
 * muestra el host antes de ejecutar. Así un comando contra producción es una decisión.
 */
export function verificarHostDestino(
  databaseUrl: string,
  argv: readonly string[] = process.argv,
  avisar: (mensaje: string) => void = (m) => process.stderr.write(`${m}\n`),
): { host: string; produccion: boolean } {
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL no es una URL válida");
  }
  if (HOSTS_LOCALES.has(host)) return { host, produccion: false };
  if (!argv.includes("--produccion")) {
    throw new Error(
      `Este script se niega a escribir en "${host}", que no es localhost. ` +
        "Si de verdad es producción, vuelve a correrlo con --produccion.",
    );
  }
  avisar(`ATENCIÓN: se va a escribir en "${host}" (--produccion).`);
  return { host, produccion: true };
}
