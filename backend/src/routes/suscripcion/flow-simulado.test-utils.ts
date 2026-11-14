/**
 * Flow simulado para los tests de la suscripción. Solo lo importan los `*.test.ts`. Verifica la
 * apiKey y la firma de cada llamada igual que Flow (si no calzan, 401), y guarda qué se llamó.
 * Todo ficticio: claves inventadas y un correo de ejemplo.
 */
import { firmar, type FetchFlow, type ParametrosFlow } from "../../services/suscripcion/flow-pagos";

export const CLAVES_PRUEBA = {
  FLOW_SANDBOX_API_KEY: "sandbox-api-key-ficticia",
  FLOW_SANDBOX_SECRET_KEY: "sandbox-secret-ficticia",
  FLOW_PROD_API_KEY: "prod-api-key-ficticia",
  FLOW_PROD_SECRET_KEY: "prod-secret-ficticia",
};

interface Importe {
  id: number;
  created: string;
  amount: number;
  status: number;
  error: number;
  attemp_count?: number;
  due_date: string;
}

interface Llamada {
  url: string;
  servicio: string;
  metodo: string;
  parametros: Record<string, string>;
}

export class FlowSimulado {
  /** Host que se espera (sandbox o producción) y sus claves. */
  constructor(
    readonly base: string,
    readonly apiKey: string,
    readonly secretKey: string,
  ) {}

  llamadas: Llamada[] = [];
  /** Si es "caido", responde 500; si es "lento", no responde hasta que se cancele la petición. */
  falla: "caido" | "lento" | null = null;
  /** Si es true, `invoice/retryToCollect` responde un error de negocio (401 con código). */
  rechazarReintento = false;
  /** Si se pone, `subscription/get` devuelve este `next_invoice_date`. */
  proximoCobro = "2026-12-13 00:00:00";
  /** Si se pone, `customer/register` responde esta URL en vez de la de Flow. */
  urlRegistro: string | null = null;
  /** Demora de `subscription/create`, para simular a Flow lento. */
  demoraCreacionMs = 0;
  plan = { planId: "suscripcion_clubcolina", name: "Suscripción Club Colina", amount: 200000, currency: "CLP" };
  clientes = new Map<
    string,
    { customerId: string; email: string; name: string; externalId: string; status: string; creditCardType?: string; last4CardDigits?: string }
  >();
  /** Si es true, `customer/list` responde 500 (Flow cae justo al buscar el cliente). */
  fallaLista = false;
  /** Si se pone, `customer/create` responde este error (estado HTTP y código de Flow). */
  errorCreacion: { status: number; code: number } | null = null;
  /** token de registro → customerId y si la inscripción fue exitosa. */
  registros = new Map<string, { customerId: string; exito: boolean }>();
  suscripciones = new Map<
    string,
    { subscriptionId: string; customerId: string; planId: string; status: number; start: string; trial: string; morose: number; invoices: Importe[] }
  >();
  private n = 0;

  servicios(): string[] {
    return this.llamadas.map((l) => l.servicio);
  }

  /** Simula que la persona inscribió (o no) la tarjeta en el sitio de Flow. */
  completarRegistro(token: string, exito = true, tarjeta = { creditCardType: "Visa", last4CardDigits: "0366" }) {
    const registro = this.registros.get(token);
    if (!registro) throw new Error("token desconocido");
    registro.exito = exito;
    const cliente = this.clientes.get(registro.customerId);
    if (exito && cliente) Object.assign(cliente, tarjeta);
  }

  fetch: FetchFlow = async (url, init) => {
    if (this.falla === "caido") return Response.json({ code: 500, message: "error" }, { status: 500 });
    if (this.falla === "lento") {
      return new Promise((_ok, error) => {
        init.signal?.addEventListener("abort", () => error(new Error("abortado")));
      });
    }
    const u = new URL(url);
    const metodo = init.method ?? "GET";
    const params = Object.fromEntries(
      metodo === "GET" ? u.searchParams : new URLSearchParams(typeof init.body === "string" ? init.body : ""),
    );
    const servicio = u.pathname.replace(/^\/api\//, "");
    this.llamadas.push({ url: `${u.origin}${u.pathname}`, servicio, metodo, parametros: params });
    if (!url.startsWith(`${this.base}/`)) return Response.json({ code: 404, message: "otro host" }, { status: 404 });
    const { s, ...sinFirma } = params;
    const firmados: ParametrosFlow = sinFirma;
    if (params.apiKey !== this.apiKey || s !== firmar(firmados, this.secretKey)) {
      return Response.json({ code: 401, message: "firma" }, { status: 401 });
    }
    if (servicio === "subscription/create" && this.demoraCreacionMs > 0) {
      await new Promise((listo) => setTimeout(listo, this.demoraCreacionMs));
    }
    return this.atender(servicio, sinFirma);
  };

  private atender(servicio: string, p: Record<string, string>): Response {
    const error = (code: number) => Response.json({ code, message: "error" }, { status: 400 });
    this.n += 1;
    switch (servicio) {
      case "plans/get":
        return p.planId === this.plan.planId ? Response.json(this.plan) : error(404);
      case "customer/create": {
        if (this.errorCreacion) {
          return Response.json({ code: this.errorCreacion.code, message: "error" }, { status: this.errorCreacion.status });
        }
        // Como Flow (visto en sandbox): un externalId repetido es 401 con código 501.
        if ([...this.clientes.values()].some((c) => c.externalId === p.externalId)) {
          return Response.json({ code: 501, message: "externalId" }, { status: 401 });
        }
        const customerId = `cus_${this.n}`;
        this.clientes.set(customerId, { customerId, email: p.email ?? "", name: p.name ?? "", externalId: p.externalId ?? "", status: "1" });
        return Response.json({ customerId, email: p.email, name: p.name, externalId: p.externalId, status: "1" });
      }
      case "customer/list": {
        if (this.fallaLista) return Response.json({ code: 500, message: "error" }, { status: 500 });
        // `filter` filtra por nombre (contiene, sin mayúsculas), como en sandbox.
        const filtro = (p.filter ?? "").toLowerCase();
        const todos = [...this.clientes.values()].filter((c) => c.name.toLowerCase().includes(filtro));
        const start = Number(p.start ?? 0);
        const limit = Number(p.limit ?? 10);
        const data = todos.slice(start, start + limit);
        // Sin `total`: el backend corta con `hasMore` (lo verificado en sandbox).
        return Response.json({ hasMore: start + limit < todos.length, data });
      }
      case "customer/get": {
        const c = this.clientes.get(p.customerId ?? "");
        return c ? Response.json({ ...c, status: "1", pay_mode: "auto" }) : error(404);
      }
      case "customer/register": {
        if (!this.clientes.has(p.customerId ?? "")) return error(404);
        const token = `TOK${this.n}ABCDEF`;
        this.registros.set(token, { customerId: p.customerId ?? "", exito: false });
        return Response.json({ url: this.urlRegistro ?? `${this.base.replace("/api", "")}/app/customer/disclaimer.php`, token });
      }
      case "customer/getRegisterStatus": {
        const r = this.registros.get(p.token ?? "");
        return r ? Response.json({ status: r.exito ? "1" : "0", customerId: r.customerId }) : error(404);
      }
      case "customer/getSubscriptions": {
        const todas = [...this.suscripciones.values()].filter((s) => s.customerId === p.customerId);
        const start = Number(p.start ?? 0);
        const limit = Number(p.limit ?? 10);
        const data = todas.slice(start, start + limit);
        return Response.json({ total: todas.length, hasMore: start + limit < todas.length ? 1 : 0, data });
      }
      case "subscription/create": {
        const subscriptionId = `sus_${this.n}`;
        const hoy = p.subscription_start ?? "";
        this.suscripciones.set(subscriptionId, {
          subscriptionId,
          customerId: p.customerId ?? "",
          planId: p.planId ?? "",
          status: 1,
          start: hoy,
          trial: p.trial_period_days ?? "",
          morose: 0,
          invoices: [{ id: this.n, created: `${hoy} 10:00:00`, amount: this.plan.amount, status: 1, error: 0, due_date: `${hoy} 00:00:00` }],
        });
        return Response.json({ subscriptionId, planId: p.planId, customerId: p.customerId, status: 1 });
      }
      case "subscription/get": {
        const s = this.suscripciones.get(p.subscriptionId ?? "");
        return s ? Response.json({ ...s, next_invoice_date: this.proximoCobro }) : error(404);
      }
      case "invoice/retryToCollect": {
        if (this.rechazarReintento) return Response.json({ code: 1105, message: "rechazo" }, { status: 401 });
        for (const s of this.suscripciones.values()) {
          const i = s.invoices.find((x) => String(x.id) === p.invoiceId);
          if (i) {
            i.status = 1;
            i.error = 0;
            s.morose = 0;
            return Response.json(i);
          }
        }
        return error(404);
      }
      default:
        return error(404);
    }
  }
}
