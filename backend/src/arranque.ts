/**
 * Orden de arranque del backend: primero las migraciones pendientes, después el servidor.
 * Si las migraciones fallan, el servidor no se levanta y el proceso termina con error:
 * el healthcheck de Railway no pasa y queda la versión anterior.
 */
export async function arrancar(pasos: {
  migrar: () => Promise<void>;
  levantar: () => Promise<void>;
  fallar: (etapa: "migraciones" | "servidor", error: unknown) => void;
}): Promise<boolean> {
  try {
    await pasos.migrar();
  } catch (error) {
    pasos.fallar("migraciones", error);
    return false;
  }
  try {
    await pasos.levantar();
  } catch (error) {
    pasos.fallar("servidor", error);
    return false;
  }
  return true;
}
