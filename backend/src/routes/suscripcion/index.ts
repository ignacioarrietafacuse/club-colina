/**
 * Plugin `suscripcion`, montado en /api/suscripcion: la suscripción mensual del club al servicio, en
 * Flow con cargo automático (docs/suscripcion-flow.md). No tiene relación con los pagos de las
 * familias ni con Forpay.
 *
 * - Todo exige sesión del panel (y la clave al día), salvo `/retorno`: Flow vuelve desde su sitio y
 *   la cookie de sesión (SameSite=Lax) no viaja en un POST desde otro sitio.
 * - Nada de esto bloquea el panel ni la verificación de QR: si Flow falla, la página dice
 *   "no disponible" y el aviso global queda apagado.
 */
import {
  avisoSuscripcionResponse,
  inscribirTarjetaRequest,
  inscribirTarjetaResponse,
  type ModoFlow,
  reintentarCobroResponse,
  RUTA_SUSCRIPCION,
  suscripcionResponse,
  type SuscripcionResponse,
} from "@club-colina/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ErrorApi } from "../../lib/errores";
import { LIMITES } from "../../lib/limite-intentos";
import { respuesta, validarEntrada } from "../../lib/validar";
import { exigirClaveAlDia, exigirSesion } from "../../services/panel/sesiones";
import {
  type ClienteFlow,
  configFlow,
  crearClienteFlow,
  ErrorFlow,
  PLAZO_FLOW_MS,
} from "../../services/suscripcion/flow-pagos";
import { inscribirTarjeta, leerEstado, procesarRetorno, reintentarCobro } from "../../services/suscripcion/suscripcion";

/** El aviso global se recalcula a lo más cada 15 minutos (no se consulta Flow en cada pantalla). */
export const DURACION_AVISO_MS = 15 * 60 * 1000;
/** Si Flow falló al calcular el aviso, se vuelve a intentar antes. */
const DURACION_AVISO_FALLIDO_MS = 60 * 1000;

/** El token con que vuelve Flow: letras y números (ej. "41097C28B5BD78C77F589FE4BC59E18AC333F9EU"). */
const tokenRetorno = z.string().regex(/^[A-Za-z0-9]{8,128}$/);

/** Caché en memoria del aviso, por modo. Hay una sola instancia del backend. */
class CacheAviso {
  private porModo = new Map<ModoFlow, { cobro_fallido: boolean; expira: number }>();
  leer(modo: ModoFlow): boolean | undefined {
    const valor = this.porModo.get(modo);
    return valor && valor.expira > Date.now() ? valor.cobro_fallido : undefined;
  }
  guardar(modo: ModoFlow, cobro_fallido: boolean, duracion = DURACION_AVISO_MS) {
    this.porModo.set(modo, { cobro_fallido, expira: Date.now() + duracion });
  }
  invalidar() {
    this.porModo.clear();
  }
}

/** El cliente de Flow para esta petición, con su plazo total de 8 s; null si falta configurar. */
function clienteFlow(request: FastifyRequest): ClienteFlow | null {
  const cfg = configFlow(request.server.config);
  if (!cfg) return null;
  return crearClienteFlow(cfg, {
    fetch: request.server.fetchFlow,
    log: request.log,
    senal: AbortSignal.timeout(PLAZO_FLOW_MS),
  });
}

function noDisponible(): ErrorApi {
  return new ErrorApi(503, "no_disponible", "El servicio de pagos no está disponible. Intenta más tarde.");
}

function registrarFallaFlow(request: FastifyRequest, error: ErrorFlow) {
  request.log.warn(
    { flow: { servicio: error.servicio, status: error.status, codigo: error.codigoFlow } },
    "Flow no respondió como se esperaba",
  );
}

export async function rutasSuscripcion(app: FastifyInstance) {
  const aviso = new CacheAviso();

  // Nada de esto se guarda en un caché: lleva el estado de pago del club.
  app.addHook("onSend", async (_request, reply) => {
    if (!reply.hasHeader("cache-control")) reply.header("cache-control", "private, no-store");
  });

  // --- Retorno desde Flow (público) ---------------------------------------------------------
  await app.register(async (publico) => {
    // Flow vuelve con un POST de formulario (`application/x-www-form-urlencoded`), que Fastify no
    // entiende solo. El analizador vive solo dentro de este plugin.
    publico.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string", bodyLimit: 4096 },
      (_request, cuerpo, hecho) => {
        hecho(null, Object.fromEntries(new URLSearchParams(String(cuerpo))));
      },
    );

    async function retorno(request: FastifyRequest, reply: FastifyReply) {
      const destino = (resultado: "ok" | "error") =>
        reply.redirect(`${request.server.config.PUBLIC_BASE_URL}${RUTA_SUSCRIPCION}?resultado=${resultado}`, 303);
      const desdeCuerpo = typeof request.body === "object" && request.body !== null ? Reflect.get(request.body, "token") : undefined;
      const desdeConsulta = typeof request.query === "object" && request.query !== null ? Reflect.get(request.query, "token") : undefined;
      const token = tokenRetorno.safeParse(desdeCuerpo ?? desdeConsulta);
      const flow = clienteFlow(request);
      if (!token.success || !flow) return destino("error");
      try {
        const resultado = await procesarRetorno(request.server.db, flow, token.data);
        aviso.invalidar();
        if (resultado === "error") request.log.warn({ flow: { modo: flow.modo } }, "retorno de Flow rechazado");
        return destino(resultado);
      } catch (error) {
        if (!(error instanceof ErrorFlow)) throw error;
        registrarFallaFlow(request, error);
        return destino("error");
      }
    }

    const opciones = { config: { rateLimit: LIMITES.suscripcionRetorno, origenExterno: true } };
    publico.get("/retorno", opciones, retorno);
    publico.post("/retorno", opciones, retorno);
  });

  // --- Con sesión ---------------------------------------------------------------------------
  await app.register(async (panel) => {
    panel.decorateRequest("usuarioPanel", undefined);
    panel.addHook("onRequest", exigirSesion);
    panel.addHook("onRequest", exigirClaveAlDia);

    panel.get("/", async (request) => {
      const flow = clienteFlow(request);
      const vacio = { plan: null, proximo_cobro: null, tarjeta: null, historial: [] };
      if (!flow) return respuesta(suscripcionResponse, { ...vacio, estado: "pendiente_configuracion", modo: null });
      let estado: SuscripcionResponse;
      try {
        estado = await leerEstado(request.server.db, flow);
      } catch (error) {
        if (!(error instanceof ErrorFlow)) throw error;
        registrarFallaFlow(request, error);
        return respuesta(suscripcionResponse, { ...vacio, estado: "no_disponible", modo: flow.modo });
      }
      // Ya que se leyó Flow, el aviso global queda al día.
      aviso.guardar(flow.modo, estado.estado === "cobro_fallido");
      return respuesta(suscripcionResponse, estado);
    });

    panel.get("/aviso", async (request) => {
      const flow = clienteFlow(request);
      if (!flow) return respuesta(avisoSuscripcionResponse, { cobro_fallido: false });
      const enCache = aviso.leer(flow.modo);
      if (enCache !== undefined) return respuesta(avisoSuscripcionResponse, { cobro_fallido: enCache });
      try {
        const estado = await leerEstado(request.server.db, flow);
        const cobroFallido = estado.estado === "cobro_fallido";
        aviso.guardar(flow.modo, cobroFallido);
        return respuesta(avisoSuscripcionResponse, { cobro_fallido: cobroFallido });
      } catch (error) {
        if (!(error instanceof ErrorFlow)) throw error;
        registrarFallaFlow(request, error);
        // Sin Flow no hay aviso: el pago nunca bloquea ni alarma por una caída de Flow.
        aviso.guardar(flow.modo, false, DURACION_AVISO_FALLIDO_MS);
        return respuesta(avisoSuscripcionResponse, { cobro_fallido: false });
      }
    });

    panel.post(
      "/inscribir-tarjeta",
      { config: { rateLimit: LIMITES.suscripcionInscribir } },
      async (request) => {
        const { email } = validarEntrada(inscribirTarjetaRequest, request.body ?? {});
        const flow = clienteFlow(request);
        if (!flow) throw noDisponible();
        aviso.invalidar();
        try {
          const resultado = await inscribirTarjeta(request.server.db, flow, {
            email,
            urlRetorno: `${request.server.config.PUBLIC_BASE_URL}/api/suscripcion/retorno`,
          });
          if (resultado.tipo === "falta_email") {
            throw new ErrorApi(409, "conflicto", "Falta el correo para inscribir la tarjeta.");
          }
          return respuesta(inscribirTarjetaResponse, { url: resultado.url });
        } catch (error) {
          if (!(error instanceof ErrorFlow)) throw error;
          registrarFallaFlow(request, error);
          throw noDisponible();
        }
      },
    );

    panel.post(
      "/reintentar",
      { config: { rateLimit: LIMITES.suscripcionReintentar } },
      async (request) => {
        const flow = clienteFlow(request);
        if (!flow) throw noDisponible();
        aviso.invalidar();
        try {
          const resultado = await reintentarCobro(request.server.db, flow);
          if (resultado.tipo === "sin_vencidos") {
            throw new ErrorApi(409, "conflicto", "No hay cobros vencidos para reintentar.");
          }
          return respuesta(reintentarCobroResponse, { resultado: resultado.pagado ? "pagado" : "rechazado" });
        } catch (error) {
          if (!(error instanceof ErrorFlow)) throw error;
          registrarFallaFlow(request, error);
          throw noDisponible();
        }
      },
    );
  });
}
