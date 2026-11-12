import {
  CreditCard,
  Flame,
  IdCard,
  LayoutDashboard,
  Shirt,
  Sparkles,
  Trophy,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { to: string; label: string; icon: LucideIcon; etapa2?: boolean };
// Navegación del PRD v1.1 (sección 6). Las solicitudes de registro viven dentro de Jugadores.
// Las secciones de la Etapa 2 están en el menú, marcadas "Pendiente".
export const nav: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jugadores", label: "Jugadores", icon: Users },
  { to: "/apoderados", label: "Apoderados", icon: UserCog },
  { to: "/entrenadores", label: "Entrenadores", icon: IdCard },
  { to: "/categorias", label: "Categorías", icon: Trophy, etapa2: true },
  { to: "/torneos", label: "Torneos y campus", icon: Flame, etapa2: true },
  { to: "/uniformes", label: "Uniformes", icon: Shirt, etapa2: true },
  { to: "/conversaciones", label: "IA y Conversaciones", icon: Sparkles, etapa2: true },
  { to: "/leads", label: "Leads", icon: UserPlus, etapa2: true },
  { to: "/pagos", label: "Pagos", icon: CreditCard, etapa2: true },
];

/** El ítem del menú queda marcado también en sus subpáginas (`/jugadores/…`). */
export function esItemActivo(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}
