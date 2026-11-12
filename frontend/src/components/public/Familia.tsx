import type { FamiliaResponse } from "@club-colina/shared";
import { Aviso } from "./Marco";
import { CodigoQr } from "./CodigoQr";

type Persona = FamiliaResponse["personas"][number];

const ESTADO: Record<Persona["estado"], { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente de aprobación", clase: "bg-warning/30 text-warning-foreground" },
  activo: { texto: "Activa", clase: "bg-success/15 text-foreground" },
  rechazado: { texto: "No aprobada", clase: "bg-destructive/10 text-destructive" },
  inactivo: { texto: "Inactiva", clase: "bg-muted text-muted-foreground" },
};

const ROL = { jugador: "Jugador", apoderado: "Apoderado" } as const;

/** Link privado de la familia: estado de la solicitud y los QR de quienes ya están activos. */
export function VistaFamilia({ datos, baseUrl }: { datos: FamiliaResponse; baseUrl: string }) {
  const hayPendientes = datos.personas.some((p) => p.estado === "pendiente");
  return (
    <div className="space-y-4">
      {hayPendientes ? (
        <Aviso tono="atencion">
          El club está revisando tu registro. Cuando lo apruebe, aquí aparecerán los códigos QR.
          Guarda este link para volver.
        </Aviso>
      ) : (
        <Aviso>Muestra el código QR de cada persona al entrar al Pucalán.</Aviso>
      )}

      <ul className="space-y-3">
        {datos.personas.map((p, i) => (
          <li key={`${p.nombre_completo}-${i}`} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold leading-tight">{p.nombre_completo}</p>
                <p className="text-sm text-muted-foreground">{ROL[p.rol]}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO[p.estado].clase}`}
              >
                {ESTADO[p.estado].texto}
              </span>
            </div>
            {p.estado === "activo" && p.credencial_token && (
              <div className="mt-4">
                <CodigoQr
                  baseUrl={baseUrl}
                  credencialToken={p.credencial_token}
                  nombreCompleto={p.nombre_completo}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {datos.otros_apoderados.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Otros apoderados</h2>
          <ul className="space-y-2">
            {datos.otros_apoderados.map((o, i) => (
              <li
                key={`${o.nombre_completo}-${i}`}
                className="rounded-xl border bg-card p-4 text-sm"
              >
                <p className="font-medium">{o.nombre_completo}</p>
                <p className="text-muted-foreground">
                  {o.foto_subida
                    ? "Ya subió su foto."
                    : "Falta que suba su foto con el link que le enviaste. Si lo perdieron, pídele uno nuevo al club."}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
