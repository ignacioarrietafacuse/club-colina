/**
 * Crea un usuario del panel, o le cambia la contraseña a uno que existe.
 *
 *   pnpm --filter @club-colina/backend exec tsx --env-file=../.env scripts/crear-usuario.ts \
 *     --usuario mony --nombre "Mony"
 *   ... scripts/crear-usuario.ts --usuario mony --cambiar [--reactivar]
 *
 * --cambiar pone la contraseña nueva y cierra las sesiones abiertas; no toca el nombre ni
 * reactiva a un usuario desactivado (para eso, --reactivar).
 * --temporal (al crear o con --cambiar) obliga a cambiar la contraseña en el primer ingreso: úsalo
 * siempre que la contraseña la elija otra persona y se la mandes.
 *
 * La contraseña se pide por la terminal (sin mostrarla) o se lee de la entrada estándar; nunca
 * va como argumento, para que no quede en el historial. Contra una base que no sea localhost
 * se niega a correr salvo con --produccion (`verificarHostDestino`).
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { crearDb } from "../src/db/cliente";
import { verificarHostDestino } from "../src/lib/guarda-host";
import {
  cambiarPassword,
  crearUsuario,
  ErrorDeUso,
  mensajeParaMostrar,
  PASSWORD_MIN,
} from "../src/services/panel/usuarios";

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  const valor = i >= 0 ? process.argv[i + 1] : undefined;
  return valor && !valor.startsWith("--") ? valor : undefined;
}

/** Lee una línea sin mostrarla en la terminal. Ctrl+C o una entrada vacía cancelan. */
function leerPassword(pregunta: string): Promise<string> {
  let silencio = false;
  const salida = new Writable({
    write(chunk: Buffer, _enc, listo) {
      if (!silencio) process.stderr.write(chunk);
      listo();
    },
  });
  const rl = createInterface({ input: process.stdin, output: salida, terminal: Boolean(process.stdin.isTTY) });
  return new Promise((resolver, rechazar) => {
    let respondida = false;
    rl.on("SIGINT", () => rl.close());
    rl.on("close", () => {
      if (!respondida) rechazar(new ErrorDeUso("Cancelado."));
    });
    rl.question(pregunta, (respuesta) => {
      respondida = true;
      rl.close();
      process.stderr.write("\n");
      resolver(respuesta);
    });
    silencio = true;
  });
}

async function main() {
  const usuario = argumento("--usuario");
  const nombre = argumento("--nombre");
  const cambiar = process.argv.includes("--cambiar");
  const reactivar = process.argv.includes("--reactivar");
  const temporal = process.argv.includes("--temporal");
  // --cambiar no toca el nombre: pasarlo igual sería creer que cambió.
  if (!usuario || (!cambiar && !nombre) || (cambiar && nombre) || (reactivar && !cambiar)) {
    throw new ErrorDeUso(
      'Uso: crear-usuario.ts --usuario <usuario> --nombre "<nombre>" [--temporal] [--produccion]\n' +
        "     crear-usuario.ts --usuario <usuario> --cambiar [--reactivar] [--temporal] [--produccion]",
    );
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new ErrorDeUso("Falta DATABASE_URL");
  try {
    verificarHostDestino(url);
  } catch (error) {
    throw new ErrorDeUso(error instanceof Error ? error.message : "Host no permitido");
  }

  const password = await leerPassword(`Contraseña (mínimo ${PASSWORD_MIN} caracteres): `);
  if (password.length === 0) throw new ErrorDeUso("Cancelado: contraseña vacía.");
  if (process.stdin.isTTY) {
    const repetida = await leerPassword("Repite la contraseña: ");
    if (repetida !== password) throw new ErrorDeUso("Las contraseñas no coinciden.");
  }

  const { db, cerrar } = crearDb(url, { max: 1 });
  try {
    if (cambiar) {
      const { activo } = await cambiarPassword(db, { usuario, password }, { reactivar, temporal });
      process.stdout.write(
        `Contraseña cambiada; sesiones cerradas. El usuario está ${activo ? "activo" : "INACTIVO (usa --reactivar)"}.\n`,
      );
    } else {
      await crearUsuario(db, { usuario, nombre: nombre ?? "", password, temporal });
      process.stdout.write("Usuario creado.\n");
    }
  } finally {
    await cerrar();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${mensajeParaMostrar(error)}\n`);
  process.exitCode = 1;
});
