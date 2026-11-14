import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { AlertTriangle, KeyRound, LogOut, Menu, Wallet, X } from "lucide-react";
import { esItemActivo, nav } from "./navegacion";

export function AppShell({
  children,
  nombreUsuario,
  onSalir,
  saliendo,
  errorSalir,
  soloCambiarClave = false,
  avisoCobroFallido = false,
}: {
  children: ReactNode;
  nombreUsuario: string;
  onSalir: () => void;
  saliendo: boolean;
  /** Si el servidor no cerró la sesión: la sesión sigue abierta y hay que decirlo. */
  errorSalir?: string;
  /** Usuario con clave temporal: sin menú, solo cambiar la clave y salir. */
  soloCambiarClave?: boolean;
  /** El último cobro de la suscripción del club falló: aviso arriba de todo, sin bloquear nada. */
  avisoCobroFallido?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b bg-card px-4 h-14">
        <button onClick={() => setOpen(true)} className="p-2 -ml-2" aria-label="Abrir menú">
          <Menu className="size-5" />
        </button>
        <BrandMark compact />
        {/* En el celular el menú lateral está escondido: "Salir" queda siempre a la vista arriba. */}
        <button
          onClick={onSalir}
          disabled={saliendo}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <LogOut className="size-4" /> {saliendo ? "Saliendo…" : "Salir"}
        </button>
      </div>

      <div className="flex">
        <aside
          className={`fixed lg:sticky top-0 z-40 h-screen w-[260px] shrink-0 bg-sidebar text-sidebar-foreground flex flex-col transition-transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <BrandMark />
            <button
              onClick={() => setOpen(false)}
              className="lg:hidden p-1"
              aria-label="Cerrar menú"
            >
              <X className="size-5" />
            </button>
          </div>

          <nav className="mt-4 flex-1 overflow-y-auto scrollbar-thin px-2 pb-4 space-y-0.5">
            {(soloCambiarClave ? [] : nav).map((item) => {
              const active = esItemActivo(item.to, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                    active
                      ? "bg-white/10 text-white font-medium shadow-inner"
                      : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white hover:translate-x-0.5"
                  }`}
                >
                  <Icon className={`size-4 ${item.etapa2 ? "opacity-60" : ""}`} />
                  <span className="flex-1">{item.label}</span>
                  {item.etapa2 && (
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-sidebar-foreground/70">
                      Pendiente
                    </span>
                  )}
                  {active && <span className="size-1.5 rounded-full bg-accent" />}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border/60 p-3">
            {!soloCambiarClave && (
              <Link
                to="/suscripcion"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                  pathname === "/suscripcion"
                    ? "bg-white/10 text-white font-medium"
                    : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Wallet className="size-4" />
                <span className="flex-1">Suscripción</span>
              </Link>
            )}
            <Link
              to="/cambiar-clave"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                pathname === "/cambiar-clave"
                  ? "bg-white/10 text-white font-medium"
                  : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              <KeyRound className="size-4" />
              <span className="flex-1">Cambiar clave</span>
            </Link>
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{nombreUsuario}</div>
                <div className="text-[11px] text-sidebar-foreground/60 truncate">Club Colina</div>
              </div>
              <button
                onClick={onSalir}
                disabled={saliendo}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-sidebar-foreground/80 hover:bg-white/5 hover:text-white disabled:opacity-50"
              >
                <LogOut className="size-4" /> {saliendo ? "Saliendo…" : "Salir"}
              </button>
            </div>
          </div>
        </aside>

        {open && (
          <div
            className="fixed inset-0 z-30 bg-black/40 lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}

        <div className="flex-1 min-w-0">
          <main className="p-4 sm:p-6 lg:p-8 max-w-[1500px] mx-auto animate-in-up">
            {/* En la página de la suscripción ya está su propio aviso. */}
            {avisoCobroFallido && !soloCambiarClave && pathname !== "/suscripcion" && (
              <div
                role="alert"
                className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                <AlertTriangle className="size-4 shrink-0" />
                <span className="flex-1">No se pudo cobrar la suscripción del club.</span>
                <Link to="/suscripcion" className="font-medium underline">
                  Revisar la suscripción
                </Link>
              </div>
            )}
            {errorSalir && (
              <p
                role="alert"
                className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {errorSalir}
              </p>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  // Compacto va en la barra blanca del celular: el logo con su fondo. Si no, sobre el azul del
  // menú lateral: el logo sin fondo (los dos salen de public/, ver scripts/generar-iconos.mjs).
  return (
    <Link to="/" className="flex items-center gap-3 group" aria-label="Club Colina">
      {compact ? (
        <img
          src="/logo-colina-fondo.png"
          alt=""
          width={270}
          height={148}
          className="h-9 w-auto rounded-md"
        />
      ) : (
        <div className="leading-tight">
          <img src="/logo-colina.png" alt="" width={228} height={112} className="h-10 w-auto" />
          <div className="mt-1.5 text-[10px] uppercase tracking-widest text-white/50">
            Plataforma Deportiva
          </div>
        </div>
      )}
    </Link>
  );
}
