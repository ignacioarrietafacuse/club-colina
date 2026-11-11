import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  LayoutDashboard,
  Sparkles,
  Users,
  UserCog,
  Trophy,
  CreditCard,
  Flame,
  UserPlus,
  Shirt,
  IdCard,
  Search,
  Bell,
  ChevronDown,
  Menu,
  X,
  Plus,
  type LucideIcon,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: LucideIcon; highlight?: boolean };
// Navegación del PRD v1.1 (sección 6). Las solicitudes de registro viven dentro de Jugadores.
const nav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jugadores", label: "Jugadores", icon: Users },
  { to: "/apoderados", label: "Apoderados", icon: UserCog },
  { to: "/entrenadores", label: "Entrenadores", icon: IdCard },
  { to: "/categorias", label: "Categorías", icon: Trophy },
  { to: "/torneos", label: "Torneos y campus", icon: Flame },
  { to: "/uniformes", label: "Uniformes", icon: Shirt },
  { to: "/conversaciones", label: "IA y Conversaciones", icon: Sparkles, highlight: true },
  { to: "/leads", label: "Leads", icon: UserPlus },
  { to: "/pagos", label: "Pagos", icon: CreditCard },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between border-b bg-card px-4 h-14">
        <button onClick={() => setOpen(true)} className="p-2 -ml-2">
          <Menu className="size-5" />
        </button>
        <BrandMark compact />
        <div className="w-8" />
      </div>

      <div className="flex">
        <aside
          className={`fixed lg:sticky top-0 z-40 h-screen w-[260px] shrink-0 bg-sidebar text-sidebar-foreground flex flex-col transition-transform ${open ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <BrandMark />
            <button onClick={() => setOpen(false)} className="lg:hidden p-1">
              <X className="size-5" />
            </button>
          </div>

          <div className="px-3 mt-2">
            <div className="flex items-center gap-2 rounded-lg bg-sidebar-accent/40 px-3 py-2 text-sm text-sidebar-foreground/70 border border-sidebar-border/40">
              <Search className="size-4" />
              <span>Buscar…</span>
              <kbd className="ml-auto rounded bg-sidebar-accent/60 px-1.5 py-0.5 text-[10px] text-white/80">
                ⌘K
              </kbd>
            </div>
          </div>

          <nav className="mt-4 flex-1 overflow-y-auto scrollbar-thin px-2 pb-4 space-y-0.5">
            {nav.map((item) => {
              const active = pathname === item.to;
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
                  <Icon className={`size-4 ${item.highlight ? "text-accent" : ""}`} />
                  <span className="flex-1">{item.label}</span>
                  {item.highlight && (
                    <span className="rounded-md bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                      IA
                    </span>
                  )}
                  {active && <span className="size-1.5 rounded-full bg-accent" />}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-sidebar-border/60 p-3">
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <div className="grid size-9 place-items-center rounded-full bg-accent text-accent-foreground font-semibold text-sm">
                CC
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">Administración</div>
                <div className="text-[11px] text-sidebar-foreground/60 truncate">Club Colina</div>
              </div>

              <ChevronDown className="size-4 text-sidebar-foreground/60" />
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
          <TopBar />
          <main className="p-4 sm:p-6 lg:p-8 max-w-[1500px] mx-auto animate-in-up">{children}</main>
        </div>
      </div>
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3 group">
      <div className="size-10 rounded-xl bg-white/10 border border-white/10 grid place-items-center overflow-hidden transition-transform group-hover:scale-105">
        {/* Pendiente: el logo real. El de Lovable se servía desde su CDN. */}
        <span className="text-sm font-bold text-white">CC</span>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-white font-semibold text-[15px]">Club Colina</div>
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            Plataforma Deportiva
          </div>
        </div>
      )}
    </Link>
  );
}

function TopBar() {
  return (
    <div className="hidden lg:flex sticky top-0 z-20 h-16 items-center gap-4 border-b bg-card/80 backdrop-blur px-6">
      <div className="flex-1 max-w-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            placeholder="Buscar jugadores, categorías, torneos…"
            className="w-full rounded-lg border bg-background/60 pl-9 pr-16 py-2 text-sm outline-none focus:border-secondary/50 focus:bg-background"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>
      <button className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3.5 py-2 text-sm font-medium hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 transition">
        <Plus className="size-4" /> Nuevo
      </button>
      <button className="relative p-2 rounded-lg hover:bg-muted">
        <Bell className="size-5 text-muted-foreground" />
        <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" />
      </button>
      <div className="h-8 w-px bg-border" />
      <div className="flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
          CC
        </div>
        <div className="text-sm leading-tight">
          <div className="font-medium">Administración</div>
          <div className="text-[11px] text-muted-foreground">Club Colina</div>
        </div>
      </div>
    </div>
  );
}
