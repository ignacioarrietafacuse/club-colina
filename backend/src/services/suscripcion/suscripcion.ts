/**
 * Suscripción del club al servicio en Flow (docs/suscripcion-flow.md). Flow es la fuente de verdad;
 * `suscripcion_servicio` guarda solo los ids, con el modo en que se crearon.
 */
import {
  PLAN_SUSCRIPCION,
  type ModoFlow,
  type SuscripcionResponse,
} from "@club-colina/shared";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db, Ejecutor } from "../../db/cliente";
import { suscripcionServicio } from "../../db/schema";
import { type ClienteFlow, ErrorFlow } from "./flow-pagos";

/** Candado de Postgres para inscribir y para el retorno: nunca dos clientes ni dos suscripciones. */
export const CANDADO_SUSCRIPCION = 7_402_032;

/** Hasta cuántos cobros muestra el historial. */
const HISTORIAL_MAX = 24;

// --- Lo que se lee de Flow --------------------------------------------------------------------
// Flow manda a veces números como texto ("200000.0000"): se aceptan los dos. Los z.object descartan
// todo lo demás (email, nombre, BIN de la tarjeta, banco).

const numero = z.coerce.number();
/** "AAAA-MM-DD hh:mm:ss" → "AAAA-MM-DD". */
const fechaFlow = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/)
  .transform((v) => v.slice(0, 10));

const planFlow = z.object({ name: z.string(), amount: numero, currency: z.string() });
const clienteFlow = z.object({
  customerId: z.string(),
  creditCardType: z.string().nullish(),
  last4CardDigits: z.string().nullish(),
});
const registroFlow = z.object({ status: z.coerce.string(), customerId: z.string() });
const importeFlow = z.object({
  id: numero,
  created: fechaFlow,
  amount: numero,
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
const listaSuscripciones = z.object({ data: z.array(suscripcionFlow.pick({ subscriptionId: true, planId: true, status: true })) });
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
}

/**
 * El registro guardado, solo si se creó con el modo activo. Uno de otro modo se ignora: los ids de
 * sandbox no existen en producción (y al revés).
 */
export async function leerRegistro(db: Ejecutor, modo: ModoFlow): Promise<RegistroSuscripcion | null> {
  const [fila] = await db
    .select({
      modo: suscripcionServicio.modo,
      flow_customer_id: suscripcionServicio.flow_customer_id,
      flow_subscription_id: suscripcionServicio.flow_subscription_id,
    })
    .from(suscripcionServicio)
    .where(eq(suscripcionServicio.id, 1));
  if (!fila || fila.modo !== modo) return null;
  return { flow_customer_id: fila.flow_customer_id, flow_subscription_id: fila.flow_subscription_id };
}

async function conCandado<T>(db: Db, fn: (tx: Ejecutor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CANDADO_SUSCRIPCION})`);
    return fn(tx);
  });
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

/** Importe impago (status 0) cuyo cobro falló o que ya venció. */
function esFallido(importe: ImporteFlow, hoy: string): boolean {
  if (importe.status !== 0) return false;
  return importe.error === 1 || (importe.due_date != null && importe.due_date < hoy);
}

function estadoCobro(importe: ImporteFlow, hoy: string) {
  if (importe.status === 1) return "pagado" as const;
  if (importe.status === 2) return "anulado" as const;
  return esFallido(importe, hoy) ? ("fallido" as const) : ("pendiente" as const);
}

/**
 * El estado combinado, leyendo Flow en el momento. Lanza `ErrorFlow` si Flow falla o no responde a
 * tiempo: la ruta lo convierte en `no_disponible`.
 */
export async function leerEstado(
  db: Ejecutor,
  flow: ClienteFlow,
  hoy: string = hoyEnSantiago(),
): Promise<SuscripcionResponse> {
  const registro = await leerRegistro(db, flow.modo);
  const [plan, cliente, suscripcion] = await Promise.all([
    flow.get("plans/get", { planId: PLAN_SUSCRIPCION }).then(deFlow(planFlow, "plans/get")),
    registro ? flow.get("customer/get", { customerId: registro.flow_customer_id }).then(deFlow(clienteFlow, "customer/get")) : null,
    registro?.flow_subscription_id
      ? flow.get("subscription/get", { subscriptionId: registro.flow_subscription_id }).then(deFlow(suscripcionFlow, "subscription/get"))
      : null,
  ]);
  const base = {
    modo: flow.modo,
    plan: { nombre: plan.name, monto: plan.amount, moneda: plan.currency },
  };
  const ultimos4 = cliente?.last4CardDigits ?? "";
  const tarjeta =
    cliente?.creditCardType && /^[0-9]{4}$/.test(ultimos4) ? { tipo: cliente.creditCardType, ultimos4 } : null;
  if (!suscripcion || suscripcion.status === SUSCRIPCION_CANCELADA || !tarjeta) {
    return { ...base, estado: "sin_tarjeta", proximo_cobro: null, tarjeta: null, historial: [] };
  }
  const importes = [...(suscripcion.invoices ?? [])].sort((a, b) => b.created.localeCompare(a.created) || b.id - a.id);
  const fallido = suscripcion.morose === 1 || importes.some((i) => esFallido(i, hoy));
  return {
    ...base,
    estado: fallido ? "cobro_fallido" : "activa",
    proximo_cobro: suscripcion.next_invoice_date ?? null,
    tarjeta,
    historial: importes.slice(0, HISTORIAL_MAX).map((i) => ({ fecha: i.created, monto: i.amount, estado: estadoCobro(i, hoy) })),
  };
}

// --- Inscribir o cambiar la tarjeta -----------------------------------------------------------

export type ResultadoInscribir = { tipo: "url"; url: string } | { tipo: "falta_email" };

/**
 * Si no hay cliente en Flow para el modo activo, lo crea con `email` y lo guarda con el modo
 * (reemplaza un registro de otro modo). Después pide a Flow el registro de tarjeta y devuelve la URL
 * a la que va el navegador. Con cliente, el correo no se pide ni se cambia: es "Cambiar tarjeta".
 */
export async function inscribirTarjeta(
  db: Db,
  flow: ClienteFlow,
  opciones: { email: string | undefined; urlRetorno: string },
): Promise<ResultadoInscribir> {
  const customerId = await conCandado(db, async (tx) => {
    const registro = await leerRegistro(tx, flow.modo);
    if (registro) return registro.flow_customer_id;
    if (!opciones.email) return null;
    const creado = deFlow(clienteFlow, "customer/create")(
      await flow.post("customer/create", { name: "Club Colina", externalId: "club-colina", email: opciones.email }),
    );
    const fila = {
      modo: flow.modo,
      flow_customer_id: creado.customerId,
      flow_subscription_id: null,
      email: opciones.email,
    };
    await tx
      .insert(suscripcionServicio)
      .values({ id: 1, ...fila })
      .onConflictDoUpdate({ target: suscripcionServicio.id, set: fila });
    return creado.customerId;
  });
  if (!customerId) return { tipo: "falta_email" };
  const registro = deFlow(z.object({ url: z.url(), token: z.string().min(1) }), "customer/register")(
    await flow.post("customer/register", { customerId, url_return: opciones.urlRetorno }),
  );
  const url = new URL(registro.url);
  url.searchParams.set("token", registro.token);
  return { tipo: "url", url: url.toString() };
}

// --- Retorno desde Flow -----------------------------------------------------------------------

export type ResultadoRetorno = "ok" | "error";

/**
 * Flow vuelve con el `token` del registro de tarjeta. Solo sigue si el registro es de nuestro
 * cliente del modo activo y quedó inscrito. Si no hay suscripción, la crea; antes busca en Flow
 * (`customer/getSubscriptions`), así un retorno repetido nunca crea una segunda.
 */
export async function procesarRetorno(
  db: Db,
  flow: ClienteFlow,
  token: string,
  hoy: string = hoyEnSantiago(),
): Promise<ResultadoRetorno> {
  const estado = deFlow(registroFlow, "customer/getRegisterStatus")(
    await flow.get("customer/getRegisterStatus", { token }),
  );
  return conCandado(db, async (tx) => {
    const registro = await leerRegistro(tx, flow.modo);
    if (!registro || registro.flow_customer_id !== estado.customerId) return "error";
    if (estado.status !== "1") return "error";
    const customerId = registro.flow_customer_id;
    const existentes = deFlow(listaSuscripciones, "customer/getSubscriptions")(
      await flow.get("customer/getSubscriptions", { customerId, start: 0, limit: 100 }),
    );
    const vigente = existentes.data.find((s) => s.planId === PLAN_SUSCRIPCION && s.status !== SUSCRIPCION_CANCELADA);
    const subscriptionId =
      vigente?.subscriptionId ??
      deFlow(suscripcionFlow.pick({ subscriptionId: true }), "subscription/create")(
        await flow.post("subscription/create", {
          planId: PLAN_SUSCRIPCION,
          customerId,
          subscription_start: hoy,
          trial_period_days: 0,
        }),
      ).subscriptionId;
    if (registro.flow_subscription_id !== subscriptionId) {
      await tx
        .update(suscripcionServicio)
        .set({ flow_subscription_id: subscriptionId })
        .where(eq(suscripcionServicio.id, 1));
    }
    return "ok";
  });
}

// --- Reintentar el cobro ----------------------------------------------------------------------

export type ResultadoReintento = { tipo: "sin_vencidos" } | { tipo: "hecho"; pagado: boolean };

/** Reintenta el cobro del importe fallido o vencido más antiguo de la suscripción. */
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
    .filter((i) => esFallido(i, hoy))
    .sort((a, b) => a.created.localeCompare(b.created) || a.id - b.id)[0];
  if (!vencido) return { tipo: "sin_vencidos" };
  const importe = deFlow(importeCobrado, "invoice/retryToCollect")(
    await flow.post("invoice/retryToCollect", { invoiceId: vencido.id }),
  );
  return { tipo: "hecho", pagado: importe.status === 1 };
}
