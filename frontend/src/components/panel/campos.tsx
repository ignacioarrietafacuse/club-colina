import type { ReactNode } from "react";

const claseControl =
  "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-secondary/60";

export function Campo({
  id,
  etiqueta,
  valor,
  onChange,
  tipo = "text",
  ayuda,
  sufijo,
  inputMode,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: "text" | "date" | "email" | "tel";
  ayuda?: string;
  sufijo?: string;
  inputMode?: "numeric" | "tel" | "email" | "text";
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          type={tipo}
          inputMode={inputMode}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className={claseControl}
        />
        {sufijo && <span className="text-xs text-muted-foreground">{sufijo}</span>}
      </div>
      {ayuda && <p className="mt-0.5 text-[11px] text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export function CampoSelect({
  id,
  etiqueta,
  valor,
  onChange,
  opciones,
  vacio,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  opciones: readonly (readonly [string, string])[];
  /** Texto de la opción vacía; sin él no hay opción vacía. */
  vacio?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </label>
      <select
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={claseControl}
      >
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
