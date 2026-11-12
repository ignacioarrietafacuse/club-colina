import {
  API,
  loginResponse,
  meResponse,
  type LoginRequest,
  type Usuario,
} from "@club-colina/shared";
import { ErrorApi, pedir, pedirSinRespuesta } from "./cliente";

/** Deja la cookie `sesion` (httpOnly): el navegador la manda sola en las llamadas siguientes. */
export function login(datos: LoginRequest) {
  return pedir(API.auth.login, loginResponse, { metodo: "POST", json: datos });
}

export function logout() {
  return pedirSinRespuesta(API.auth.logout, { metodo: "POST" });
}

export function me() {
  return pedir(API.auth.me, meResponse);
}

/**
 * Usuario con sesión, o `null` si el servidor dice 401. Cualquier otro error se lanza: quien
 * llama decide, y la guarda del panel lo trata como "sin sesión" (denegar por defecto).
 */
export async function sesionActual(): Promise<Usuario | null> {
  try {
    return (await me()).usuario;
  } catch (error) {
    if (error instanceof ErrorApi && error.status === 401) return null;
    throw error;
  }
}
