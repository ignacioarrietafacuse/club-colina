import type { ReactNode } from "react";

export function PageHeader({
  title, subtitle, actions, icon,
}: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="grid size-11 place-items-center rounded-xl bg-primary/5 text-primary border border-primary/10">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card-surface p-5 ${className}`}>{children}</div>;
}

export function StatCard({
  label, value, delta, deltaTone = "positive", icon,
}: {
  label: string; value: string; delta?: string;
  deltaTone?: "positive" | "negative" | "neutral"; icon?: ReactNode;
}) {
  const tone =
    deltaTone === "positive" ? "text-success bg-success/10"
    : deltaTone === "negative" ? "text-destructive bg-destructive/10"
    : "text-muted-foreground bg-muted";
  return (
    <div className="card-surface p-5 card-hover">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
        </div>
        {icon && <div className="grid size-10 place-items-center rounded-lg bg-primary/5 text-primary">{icon}</div>}
      </div>
      {delta && (
        <div className={`mt-3 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
          {delta}
        </div>
      )}
    </div>
  );
}

export function Badge({
  children, tone = "neutral", className = "",
}: { children: ReactNode; tone?: "neutral"|"success"|"warning"|"danger"|"info"|"accent"|"basket"|"volley"|"primary"; className?: string }) {
  const map: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-secondary/10 text-secondary",
    accent: "bg-accent/15 text-accent",
    primary: "bg-primary/10 text-primary",
    basket: "bg-accent/15 text-accent",
    volley: "bg-secondary/10 text-secondary",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${map[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Button({
  children, variant = "primary", size = "md", className = "", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "accent";
  size?: "sm" | "md" | "lg";
}) {
  const base = "inline-flex items-center gap-2 font-medium rounded-lg transition-all disabled:opacity-50 active:scale-[0.98]";
  const sz = size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-5 py-3 text-sm" : "px-4 py-2 text-sm";
  const v = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/90",
    accent: "bg-accent text-accent-foreground hover:bg-accent/90 hover:shadow-md hover:shadow-accent/25",
    outline: "border border-border bg-card hover:bg-muted text-foreground",
    ghost: "text-foreground hover:bg-muted",
  }[variant];
  return <button className={`${base} ${sz} ${v} ${className}`} {...props}>{children}</button>;
}

export function DisciplineBadge({ d }: { d: "basketball" | "volleyball" }) {
  return d === "basketball" ? (
    <Badge tone="basket">🏀 Basketball</Badge>
  ) : (
    <Badge tone="volley">🏐 Voleibol</Badge>
  );
}

export function EmptyToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>
  );
}

/** Colored gradient avatar (deterministic from a name) — used across teams, players, coaches. */
export function Avatar({ name, size = 40, discipline }: { name: string; size?: number; discipline?: "basketball" | "volleyball" }) {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const hash = Array.from(name).reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradients = [
    "from-primary to-secondary",
    "from-secondary to-primary",
    "from-primary to-accent/80",
    "from-secondary to-accent/70",
  ];
  const g = discipline === "basketball" ? "from-primary to-accent" : discipline === "volleyball" ? "from-primary to-secondary" : gradients[hash % gradients.length];
  return (
    <div
      className={`grid place-items-center rounded-full bg-gradient-to-br ${g} text-white font-semibold shrink-0`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </div>
  );
}
