/**
 * Cliente tipado de la API. Todo pasa por el contrato de `shared/`: las respuestas se validan
 * con su esquema y lo que no calce es un `ErrorApi` con código `respuesta_invalida`.
 *
 * Uso: `import { api, ErrorApi } from "@/lib/api"` y `api.publico.familia(token)`.
 * Dueño: S4 (Frontend panel). S5 lo usa en modo solo lectura y, si le falta algo, lo pide.
 */
import * as auth from "./auth";
import * as panel from "./panel";
import * as publico from "./publico";

export const api = { auth, panel, publico };
export { ErrorApi, esErrorApi, mensajeDeError, type CodigoErrorCliente } from "./cliente";
export type { FiltrosApoderados, FiltrosJugadores, FiltrosSolicitudes, TipoPersona } from "./panel";
