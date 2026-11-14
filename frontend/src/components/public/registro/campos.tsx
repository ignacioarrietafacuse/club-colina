import { NUMERO_SIN_ASIGNAR } from "@club-colina/shared";
import { useId, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { NOMBRE_DISCIPLINA } from "../textos";
import { CampoFoto } from "./CampoFoto";
import type { Campos, DatosPersona, Errores } from "./modelo";

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
      </label>
      {children(id)}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function Casilla({
  marcada,
  onCambio,
  children,
  error,
}: {
  marcada: boolean;
  onCambio: (v: boolean) => void;
  children: ReactNode;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
          checked={marcada}
          onChange={(e) => onCambio(e.target.checked)}
        />
        <span>{children}</span>
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

const SELECT =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Los campos de una persona que el formulario tiene que preguntar (`c.pedir`). Sirve para
 * quien llena, para un hijo y para el jugador adulto.
 */
export function CamposPersona({
  c,
  datos,
  foto,
  onDatos,
  onFoto,
  errores,
  prefijo = "",
  etiquetaFoto,
}: {
  c: Campos;
  datos: DatosPersona;
  foto: File | null;
  onDatos: (cambio: Partial<DatosPersona>) => void;
  onFoto: (foto: File | null) => void;
  errores: Errores;
  prefijo?: string;
  etiquetaFoto: string;
}) {
  const e = (campo: string) => errores[`${prefijo}${campo}`];
  return (
    <div className="space-y-4">
      {c.pedir.has("nombre") && (
        <Campo etiqueta="Nombre" error={e("nombre")}>
          {(id) => (
            <Input
              id={id}
              autoComplete="off"
              className="h-10"
              value={datos.nombre}
              maxLength={80}
              onChange={(ev) => onDatos({ nombre: ev.target.value })}
            />
          )}
        </Campo>
      )}
      {c.pedir.has("apellido") && (
        <Campo etiqueta="Apellido" error={e("apellido")}>
          {(id) => (
            <Input
              id={id}
              autoComplete="off"
              className="h-10"
              value={datos.apellido}
              maxLength={80}
              onChange={(ev) => onDatos({ apellido: ev.target.value })}
            />
          )}
        </Campo>
      )}
      {c.pedir.has("telefono") && (
        <Campo etiqueta="Teléfono" error={e("telefono")} ayuda="9 dígitos, por ejemplo 912345678.">
          {(id) => (
            <Input
              id={id}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              className="h-10"
              value={datos.telefono}
              maxLength={20}
              onChange={(ev) => onDatos({ telefono: ev.target.value })}
            />
          )}
        </Campo>
      )}
      {c.pedir.has("fecha_nacimiento") && (
        <Campo etiqueta="Fecha de nacimiento" error={e("fecha_nacimiento")}>
          {(id) => (
            <Input
              id={id}
              type="date"
              className="h-10"
              value={datos.fecha_nacimiento}
              onChange={(ev) => onDatos({ fecha_nacimiento: ev.target.value })}
            />
          )}
        </Campo>
      )}
      {c.pedir.has("disciplina") && (
        <Campo etiqueta="Rama" error={e("disciplina")}>
          {(id) => (
            <select
              id={id}
              className={SELECT}
              value={datos.disciplina}
              onChange={(ev) => {
                const v = ev.target.value;
                const disciplina = v === "basketball" || v === "voleibol" ? v : "";
                onDatos({ disciplina });
              }}
            >
              <option value="">Elige una rama</option>
              <option value="basketball">{NOMBRE_DISCIPLINA.basketball}</option>
              <option value="voleibol">{NOMBRE_DISCIPLINA.voleibol}</option>
            </select>
          )}
        </Campo>
      )}
      {c.pedir.has("numero_camiseta") && (
        <Campo
          etiqueta="Número de camiseta"
          error={e("numero_camiseta")}
          ayuda={`Si aún no tiene número asignado, escribe ${NUMERO_SIN_ASIGNAR}.`}
        >
          {(id) => (
            <Input
              id={id}
              inputMode="numeric"
              autoComplete="off"
              className="h-10 w-28"
              value={datos.numero_camiseta}
              maxLength={2}
              onChange={(ev) => onDatos({ numero_camiseta: ev.target.value.replace(/\D/g, "") })}
            />
          )}
        </Campo>
      )}
      {c.pedir.has("foto") && (
        <CampoFoto etiqueta={etiquetaFoto} foto={foto} onCambio={onFoto} error={e("foto")} />
      )}
    </div>
  );
}
