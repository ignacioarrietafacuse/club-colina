import { cambiarClaveRequest, COOKIE_SESION, loginRequest, loginResponse, meResponse } from "@club-colina/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { ErrorApi } from "../../lib/errores";
import { ipCliente, LIMITES } from "../../lib/limite-intentos";
import { respuesta, validarEntrada } from "../../lib/validar";
import {
  borrarCookieSesion,
  borrarSesion,
  crearSesion,
  exigirSesion,
  ponerCookieSesion,
  prepararHashFalso,
  verificarCredenciales,
} from "../../services/panel/sesiones";
import { cambiarClavePropia } from "../../services/panel/usuarios";

/**
 * Tope de intentos de login solo por IP, además del de usuario + IP (`LIMITES.login`): quien
 * prueba muchos usuarios desde la misma IP queda frenado igual. Generoso porque en Chile
 * muchos celulares comparten IP (CGNAT) y el panel lo usan una o dos personas.
 */
export const LIMITE_LOGIN_IP = { max: 20, timeWindow: "15 minutes" } as const;

/**
 * Plugin `auth`, montado en /api/auth: POST /login, POST /logout, GET /me y POST /cambiar-clave.
 * Ninguna pasa por `exigirClaveAlDia`: son las que un usuario con clave temporal sí puede usar.
 */
export async function rutasAuth(app: FastifyInstance) {
  app.decorateRequest("usuarioPanel", undefined);
  // /me y el login devuelven datos de la sesión: sin caché, con la misma regla que el panel.
  app.addHook("onSend", async (_request, reply) => {
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "private, no-store");
  });
  await prepararHashFalso();
  // `@fastify/rate-limit` marca la petición como contada en el primer límite que corre, así que
  // un segundo `config.rateLimit` (o `app.rateLimit()`) en la misma ruta no contaría nunca.
  // `createRateLimit` solo calcula, sin marcar: corre en un preHandler propio y deja que el de
  // usuario + IP de la configuración de la ruta cuente aparte. Cada intento suma en los dos.
  const limitePorIp = app.createRateLimit({
    ...LIMITE_LOGIN_IP,
    keyGenerator: (request: FastifyRequest) => `login-ip|${ipCliente(request)}`,
  });

  app.post(
    "/login",
    {
      config: { rateLimit: LIMITES.login },
      preHandler: async (request, reply) => {
        const resultado = await limitePorIp(request);
        // `isAllowed` solo dice si la llave está en la lista blanca; lo que importa es `isExceeded`.
        if (!resultado.isAllowed && resultado.isExceeded) {
          reply.header("retry-after", resultado.ttlInSeconds);
          throw new ErrorApi(429, "demasiados_intentos", "Demasiados intentos. Espera un momento.");
        }
      },
    },
    async (request, reply) => {
      const { usuario, password } = validarEntrada(loginRequest, request.body);
      const encontrado = await verificarCredenciales(app.db, usuario, password);
      if (!encontrado) {
        throw new ErrorApi(401, "credenciales_invalidas", "Usuario o contraseña incorrectos");
      }
      const { token, expira } = await crearSesion(app.db, encontrado.id);
      ponerCookieSesion(reply, token, expira);
      return respuesta(loginResponse, { usuario: encontrado });
    },
  );

  app.post("/logout", async (request, reply) => {
    await borrarSesion(app.db, request.cookies[COOKIE_SESION]);
    borrarCookieSesion(reply);
    return reply.status(204).send();
  });

  app.get("/me", { onRequest: exigirSesion }, async (request) => {
    if (!request.usuarioPanel) throw new ErrorApi(401, "no_autenticado", "Sesión requerida");
    return respuesta(meResponse, { usuario: request.usuarioPanel });
  });

  app.post(
    "/cambiar-clave",
    { onRequest: exigirSesion, config: { rateLimit: LIMITES.cambiarClave } },
    async (request, reply) => {
      const usuario = request.usuarioPanel;
      if (!usuario) throw new ErrorApi(401, "no_autenticado", "Sesión requerida");
      const { clave_actual, clave_nueva } = validarEntrada(cambiarClaveRequest, request.body);
      const { token, expira } = await cambiarClavePropia(app.db, {
        usuarioId: usuario.id,
        claveActual: clave_actual,
        claveNueva: clave_nueva,
      });
      ponerCookieSesion(reply, token, expira);
      return reply.status(204).send();
    },
  );
}
