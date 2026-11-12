/**
 * Crea un usuario del panel (o le cambia la contraseña con --cambiar).
 *
 *   pnpm --filter @club-colina/backend exec tsx --env-file=../.env scripts/crear-usuario.ts \
 *     --usuario mony --nombre "Mony"
 *
 * La contraseña se pide por la terminal (sin mostrarla) o se lee de la entrada estándar; nunca
 * va como argumento, para que no quede en el historial. Contra una base que no sea localhost
 * se niega a correr salvo con --produccion (`verificarHostDestino`).
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { crearDb } from "../src/db/cliente";
import { verificarHostDestino } from "../src/lib/guarda-host";
import { crearOActualizarUsuario, PASSWORD_MIN } from "../src/services/panel/usuarios";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  const valor = i >= 0 ? process.argv[i + 1] : undefined;
  return valor && !valor.startsWith("--") ? valor : undefined;
}

/** Lee una línea sin mostrarla en la terminal. */
function leerPassword(pregunta: string): Promise<string> {
  let silencio = false;
  const salida = new Writable({
    write(chunk: Buffer, _enc, listo) {
      if (!silencio) process.stderr.write(chunk);
      listo();
    },
  });
  const rl = createInterface({ input: process.stdin, output: salida, terminal: process.stdin.isTTY });
  return new Promise((resolver) => {
    rl.question(pregunta, (respuesta) => {
      rl.close();
      if (process.stdin.isTTY) process.stderr.write("\n");
      resolver(respuesta);
    });
    silencio = true;
  });
}

async function main() {
  const usuario = argumento("--usuario");
  const nombre = argumento("--nombre");
  const cambiar = process.argv.includes("--cambiar");
  if (!usuario || !nombre) {
    throw new Error('Uso: crear-usuario.ts --usuario <usuario> --nombre "<nombre>" [--cambiar] [--produccion]');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL");
  verificarHostDestino(url);

  const password = await leerPassword(`Contraseña (mínimo ${PASSWORD_MIN} caracteres): `);
  if (process.stdin.isTTY) {
    const repetida = await leerPassword("Repite la contraseña: ");
    if (repetida !== password) throw new Error("Las contraseñas no coinciden.");
  }

  const { db, cerrar } = crearDb(url, { max: 1 });
  try {
    const resultado = await crearOActualizarUsuario(db, { usuario, nombre, password }, { cambiar });
    process.stdout.write(`Usuario ${resultado}.\n`);
  } finally {
    await cerrar();
  }
}

main().catch((error: unknown) => {
  // Solo el mensaje propio; nunca el de un error de la base (lleva los parámetros).
  const mensaje = error instanceof Error && !("code" in error) ? error.message : "Error al escribir en la base.";
  process.stderr.write(`${mensaje}\n`);
  process.exitCode = 1;
});
