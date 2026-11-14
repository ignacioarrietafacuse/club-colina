import {
  API,
  avisoSuscripcionResponse,
  inscribirTarjetaResponse,
  reintentarCobroResponse,
  suscripcionResponse,
  type InscribirTarjetaRequest,
} from "@club-colina/shared";
import { pedir } from "./cliente";

/** Suscripción del club en Flow (con sesión). Ver docs/suscripcion-flow.md. */

export function estado(signal?: AbortSignal) {
  return pedir(API.suscripcion.estado, suscripcionResponse, { signal });
}

/** Solo `{ cobro_fallido }`, para el aviso global; el backend lo guarda 15 minutos. */
export function aviso(signal?: AbortSignal) {
  return pedir(API.suscripcion.aviso, avisoSuscripcionResponse, { signal });
}

/** Devuelve la URL de Flow a la que hay que llevar el navegador. Sirve también para cambiar la tarjeta. */
export function inscribirTarjeta(datos: InscribirTarjetaRequest) {
  return pedir(API.suscripcion.inscribirTarjeta, inscribirTarjetaResponse, {
    metodo: "POST",
    json: datos,
  });
}

export function reintentar() {
  return pedir(API.suscripcion.reintentar, reintentarCobroResponse, { metodo: "POST", json: {} });
}
