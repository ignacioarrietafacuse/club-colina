/**
 * Suscripción del club al servicio en Flow (docs/suscripcion-flow.md). Flow es la fuente de verdad;
 * `suscripcion_servicio` guarda solo los ids, con el modo en que se crearon, y el token pendiente de
 * la última inscripción de tarjeta.
 */
import { PLAN_SUSCRIPCION, type ModoFlow, type SuscripcionResponse } from "@club-colina/shared";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Ejecutor } from "../../db/cliente";
import { suscripcionServicio } from "../../db/schema";
import { hashToken } from "../../lib/tokens";
import { type ClienteFlow, ErrorFlow } from "./flow-pagos";

/** Candado de Postgres para inscribir y para el retorno: nunca dos clientes ni dos suscripciones. */
export const CANDADO_SUSCRIPCION = 7_402_032;

/** Hasta cuántos cobros muestra el historial. */
const HISTORIAL_MAX = 24;

/** Cuánto tiempo sirve el token de una inscripción de tarjeta para volver de Flow. */
export const VIGENCIA_REGISTRO_MS = 2 * 60 * 60 * 1000;

// --- Lo que se lee de Flow --------------------------------------------------------------------
// Flow manda a veces números como texto ("200000.0000"): se aceptan los dos. Los z.object descartan
// todo lo demás (email, nombre, BIN de la tarjeta, banco).

const numero = z.coerce.number();
/** "AAAA-MM-DD hh:mm:ss" → "AAAA-MM-DD", y tiene que ser una fecha válida. */
const fechaFlow = z
  .string()
  .transform((v) => v.slice(0, 10))
  .pipe(z.iso.date());

const planFlow = z.object({ name: z.string(), amount: numero.pipe(z.number().nonnegative()), currency: z.string() });
const clienteFlow = z.object({
  customerId: z.string(),
  creditCardType: z.string().nullish(),
  last4CardDigits: z.string().nullish(),
});
const registroFlow = z.object({ status: z.coerce.string(), customerId: z.string() });
const importeFlow = z.object({
  id: numero,
  created: fechaFlow,
  amount: numero.pipe(z.number().nonnegative()),
  status: numero,
  error: numero.nullish(),
  due_date: fechaFlow.nullish(),
});
const suscripcionFlow = z.object({
  subscriptionId: z.string(),
  planId: z.string(),
  status: numero,
  morose: numero.nullish(),
  next_invoice_date: fechaFlow.nullish(),
  invoices: z.array(importeFlow).nullish(),
});
const listaSuscripciones = z.object({
  data: z.array(suscripcionFlow.pick({ subscriptionId: true, planId: true, status: true })),
});
const importeCobrado = z.object({ status: numero });

type ImporteFlow = z.infer<typeof importeFlow>;

/** Una respuesta de Flow que no tiene la forma esperada cuenta como Flow caído, no como error nuestro. */
function deFlow<T extends z.ZodType>(esquema: T, servicio: string): (cuerpo: unknown) => z.output<T> {
  return (cuerpo) => {
    const r = esquema.safeParse(cuerpo);
    if (!r.success) throw new ErrorFlow(servicio, 200);
    return r.data;
  };
}

/** Estado de una suscripción en Flow: 0 no iniciada, 1 activa, 2 en trial, 4 cancelada. */
const SUSCRIPCION_CANCELADA = 4;

// --- Base -------------------------------------------------------------------------------------

export interface RegistroSuscripcion {
  flow_customer_id: string;
  flow_subscription_id: string | null;
  registro_token_hash: string | null;
  registro_token_expira: Date | null;
}

async function leerFila(db: Ejecutor) {
  const [fila] = await db.select().from(suscripcionServicio).where(eq(suscripcionServicio.id, 1));
  return fila ?? null;
}

/**
 * El registro guardado, solo si se creó con el modo activo. Uno de otro modo se ignora: los ids de
 * sandbox no existen en producción (y al revés).
 */
export async function leerRegistro(db: Ejecutor, modo: ModoFlow): Promise<RegistroSuscripcion | null> {
  const fila = await leerFila(db);
  if (!fila || fila.modo !== modo) return null;
  return {
    flow_customer_id: fila.flow_customer_id,
    flow_subscription_id: fila.flow_subscription_id,
    registro_token_hash: fila.registro_token_hash,
    registro_token_expira: fila.registro_token_expira,
  };
}

async function conCandado<T>(db: Db, fn: (tx: Ejecutor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CANDADO_SUSCRIPCION})`);
    return fn(tx);
  });
}

/** La suscripción vigente (no cancelada) del plan para este cliente, buscada en Flow. */
async function buscarVigente(flow: ClienteFlow, customerId: string): Promise<string | undefined> {
  const lista = deFlow(listaSuscripciones, "customer/getSubscriptions")(
    await flow.get("customer/getSubscriptions", { customerId, start: 0, limit: 100 }),
  );
  return lista.data.find((s) => s.planId === PLAN_SUSCRIPCION && s.status !== SUSCRIPCION_CANCELADA)?.subscriptionId;
}

// --- Fechas -----------------------------------------------------------------------------------

/** Hoy en Chile continental, "AAAA-MM-DD" (el primer cobro es el día en que se inscribe la tarjeta). */
export function hoyEnSantiago(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

// --- Estado -----------------------------------------------------------------------------------

/** Importe impago (status 0) que ya venció. */
function esVencido(importe: ImporteFlow, hoy: string): boolean {
  return importe.status === 0 && importe.due_date != null && importe.due_date < hoy;
}

/** Importe impago cuyo cobro falló o que ya venció. */
function esFallido(importe: ImporteFlow, hoy: string): boolean {
  return importe.status === 0 && (importe.error === 1 || esVencido(importe, hoy));
}

function estadoCobro(importe: ImporteFlow, hoy: string) {
  if (importe.status === 1) return "pagado" as const;
  if (importe.status === 2) return "anulado" as const;
  return esFallido(importe, hoy) ? ("fallido" as const) : ("pendiente" as const);
}

/**
 * El estado combinado, leyendo Flow en el momento. Lanza `ErrorFlow` si Flow falla o no responde a
 * tiempo: la ruta lo convierte en `no_disponible`.
 *
 * Si hay cliente pero no quedó guardada la suscripción (por ejemplo, Flow la creó y su respuesta
 * llegó tarde al retorno), la busca en Flow y la guarda: así un cobro ya hecho nunca se ve como
 * "sin tarjeta".
 */
export async function leerEstado(
  db: Ejecutor,
  flow: ClienteFlow,
  hoy: string = hoyEnSantiago(),
): Promise<SuscripcionResponse> {
  const registro = await leerRegistro(db, flow.modo);
  let subscriptionId = registro?.flow_subscription_id ?? null;
  if (registro && !subscriptionId) {
    subscriptionId = (await buscarVigente(flow, registro.flow_customer_id)) ?? null;
    if (subscriptionId) {
      await db
        .update(suscripcionServicio)
        .set({ flow_subscription_id: subscriptionId })
        .where(and(eq(suscripcionServicio.id, 1), eq(suscripcionServicio.modo, flow.modo), isNull(suscripcionServicio.flow_subscription_id)));
    }
  }
  const [plan, cliente, suscripcion] = await Promise.all([
    flow.get("plans/get", { planId: PLAN_SUSCRIPCION }).then(deFlow(planFlow, "plans/get")),
    registro
      ? flow.get("customer/get", { customerId: registro.flow_customer_id }).then(deFlow(clienteFlow, "customer/get"))
      : null,
    subscriptionId
      ? flow.get("subscription/get", { subscriptionId }).then(deFlow(suscripcionFlow, "subscription/get"))
      : null,
  ]);
  const base = {
    modo: flow.modo,
    tiene_cliente: registro !== null,
    plan: { nombre: plan.name, monto: plan.amount, moneda: plan.currency },
  };
  const ultimos4 = cliente?.last4CardDigits ?? "";
  const tarjeta =
    cliente?.creditCardType && /^[0-9]{4}$/.test(ultimos4) ? { tipo: cliente.creditCardType, ultimos4 } : null;
  if (!suscripcion || suscripcion.status === SUSCRIPCION_CANCELADA) {
    return { ...base, estado: "sin_tarjeta", proximo_cobro: null, tarjeta: null, historial: [] };
  }
  // Con suscripción viva, una tarjeta que Flow ya no informa no esconde un cobro fallido.
  const importes = [...(suscripcion.invoices ?? [])].sort((a, b) => b.created.localeCompare(a.created) || b.id - a.id);
  const fallido = suscripcion.morose === 1 || importes.some((i) => esFallido(i, hoy));
  return {
    ...base,
    estado: fallido ? "cobro_fallido" : "activa",
    proximo_cobro: suscripcion.next_invoice_date ?? null,
    tarjeta,
    historial: importes
      .slice(0, HISTORIAL_MAX)
      .map((i) => ({ fecha: i.created, monto: i.amount, estado: estadoCobro(i, hoy) })),
  };
}

// --- Inscribir o cambiar la tarjeta -----------------------------------------------------------

export type ResultadoInscribir =
  | { tipo: "url"; url: string }
  | { tipo: "falta_email" }
  | { tipo: "produccion_activa" };

/**
 * Si no hay cliente en Flow para el modo activo, lo crea con `email` y lo guarda con el modo
 * (reemplaza un registro de sandbox; nunca uno de producción desde sandbox, para no perder los ids
 * de la suscripción real). Después pide a Flow el registro de tarjeta, guarda el hash de su token
 * como el único que el retorno va a aceptar, y devuelve la URL a la que va el navegador. Con cliente,
 * el correo no se pide ni se cambia: es "Cambiar tarjeta".
 */
export async function inscribirTarjeta(
  db: Db,
  flow: ClienteFlow,
  opciones: { email: string | undefined; urlRetorno: string },
): Promise<ResultadoInscribir> {
  return conCandado(db, async (tx) => {
    const fila = await leerFila(tx);
    if (fila && fila.modo === "produccion" && flow.modo === "sandbox") return { tipo: "produccion_activa" };
    let customerId = fila?.modo === flow.modo ? fila.flow_customer_id : null;
    if (!customerId) {
      if (!opciones.email) return { tipo: "falta_email" };
      const creado = deFlow(clienteFlow, "customer/create")(
        await flow.post("customer/create", { name: "Club Colina", externalId: "club-colina", email: opciones.email }),
      );
      customerId = creado.customerId;
      const nueva = {
        modo: flow.modo,
        flow_customer_id: customerId,
        flow_subscription_id: null,
        email: opciones.email,
        registro_token_hash: null,
        registro_token_expira: null,
      };
      await tx
        .insert(suscripcionServicio)
        .values({ id: 1, ...nueva })
        .onConflictDoUpdate({ target: suscripcionServicio.id, set: nueva });
    }
    const registro = deFlow(z.object({ url: z.url(), token: z.string().min(1) }), "customer/register")(
      await flow.post("customer/register", { customerId, url_return: opciones.urlRetorno }),
    );
    await tx
      .update(suscripcionServicio)
      .set({
        registro_token_hash: hashToken(registro.token),
        registro_token_expira: new Date(Date.now() + VIGENCIA_REGISTRO_MS),
      })
      .where(eq(suscripcionServicio.id, 1));
    const url = new URL(registro.url);
    url.searchParams.set("token", registro.token);
    return { tipo: "url" as const, url: url.toString() };
  });
}

// --- Retorno desde Flow -----------------------------------------------------------------------

export type ResultadoRetorno = "ok" | "error";

/**
 * Flow vuelve con el `token` del registro de tarjeta. Solo se acepta el token de la última
 * inscripción pedida desde el panel, dentro de su vigencia y una sola vez; cualquier otro termina en
 * "error" sin llamar a Flow. Después se exige que el registro sea de nuestro cliente del modo activo
 * y que haya quedado inscrito. Si no hay suscripción, la busca en Flow (`customer/getSubscriptions`)
 * y solo si no existe la crea: un retorno repetido nunca crea una segunda.
 */
export async function procesarRetorno(
  db: Db,
  flow: ClienteFlow,
  token: string,
  hoy: string = hoyEnSantiago(),
): Promise<ResultadoRetorno> {
  const hash = hashToken(token);
  return conCandado(db, async (tx) => {
    const registro = await leerRegistro(tx, flow.modo);
    if (!registro || registro.registro_token_hash !== hash) return "error";
    // Ya usado: el mismo retorno otra vez (recargar, volver atrás). No se toca Flow.
    if (registro.registro_token_expira === null) return registro.flow_subscription_id ? "ok" : "error";
    if (registro.registro_token_expira.getTime() < Date.now()) return "error";

    const estado = deFlow(registroFlow, "customer/getRegisterStatus")(
      await flow.get("customer/getRegisterStatus", { token }),
    );
    const customerId = registro.flow_customer_id;
    if (estado.customerId !== customerId || estado.status !== "1") {
      // El token ya no sirve para nada: se descarta.
      await tx
        .update(suscripcionServicio)
        .set({ registro_token_hash: null, registro_token_expira: null })
        .where(eq(suscripcionServicio.id, 1));
      return "error";
    }
    const subscriptionId =
      (await buscarVigente(flow, customerId)) ??
      deFlow(suscripcionFlow.pick({ subscriptionId: true }), "subscription/create")(
        await flow.post("subscription/create", {
          planId: PLAN_SUSCRIPCION,
          customerId,
          subscription_start: hoy,
          trial_period_days: 0,
        }),
      ).subscriptionId;
    await tx
      .update(suscripcionServicio)
      .set({ flow_subscription_id: subscriptionId, registro_token_expira: null })
      .where(eq(suscripcionServicio.id, 1));
    return "ok";
  });
}

// --- Reintentar el cobro ----------------------------------------------------------------------

export type ResultadoReintento = { tipo: "sin_vencidos" } | { tipo: "hecho"; pagado: boolean };

/**
 * Reintenta el cobro del importe vencido más antiguo de la suscripción. Solo los vencidos: Flow
 * reintenta el cobro "de un invoice vencido" (invoice/retryToCollect).
 */
export async function reintentarCobro(
  db: Ejecutor,
  flow: ClienteFlow,
  hoy: string = hoyEnSantiago(),
): Promise<ResultadoReintento> {
  const registro = await leerRegistro(db, flow.modo);
  if (!registro?.flow_subscription_id) return { tipo: "sin_vencidos" };
  const suscripcion = deFlow(suscripcionFlow, "subscription/get")(
    await flow.get("subscription/get", { subscriptionId: registro.flow_subscription_id }),
  );
  const vencido = (suscripcion.invoices ?? [])
    .filter((i) => esVencido(i, hoy))
    .sort((a, b) => a.created.localeCompare(b.created) || a.id - b.id)[0];
  if (!vencido) return { tipo: "sin_vencidos" };
  const importe = deFlow(importeCobrado, "invoice/retryToCollect")(
    await flow.post("invoice/retryToCollect", { invoiceId: vencido.id }),
  );
  return { tipo: "hecho", pagado: importe.status === 1 };
}
