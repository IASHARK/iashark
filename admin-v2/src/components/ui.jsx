// Briques d'interface partagees. Regle visuelle du site : cyan + gris,
// vert/rouge UNIQUEMENT pour les ecarts chiffres, cartes differenciees.
import { fmtPct } from "../lib/format.js";

export function Card({ title, subtitle, right, children, className = "" }) {
  return (
    <section className={"rounded-2xl border border-edge bg-card p-5 " + className}>
      {(title || right) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[15px] font-bold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-soft">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

// Ecart chiffre vs periode precedente : la SEULE place du vert/rouge.
export function Delta({ value, goodWhenUp = true }) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return <span className="text-xs text-soft">pas de comparaison</span>;
  }
  const up = value > 0.5;
  const down = value < -0.5;
  const good = up ? goodWhenUp : down ? !goodWhenUp : null;
  const cls = good === null ? "text-soft" : good ? "text-up" : "text-down";
  const arrow = up ? "▲" : down ? "▼" : "=";
  return (
    <span className={"text-xs font-semibold tabular-nums " + cls}>
      {arrow} {fmtPct(Math.abs(value), Math.abs(value) < 10 ? 1 : 0)}
    </span>
  );
}

export function Kpi({ label, value, delta, goodWhenUp = true, hint }) {
  return (
    <div className="rounded-2xl border border-edge bg-card p-4">
      <p className="text-xs font-medium text-soft">{label}</p>
      <p className="mt-1.5 text-[26px] font-extrabold leading-none tracking-tight text-ink tabular-nums">{value}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Delta value={delta} goodWhenUp={goodWhenUp} />
        {hint && <span className="truncate text-[11px] text-soft">{hint}</span>}
      </div>
    </div>
  );
}

export function Badge({ tone = "soft", children }) {
  const tones = {
    soft: "border-edge text-soft",
    cyan: "border-cyan/40 bg-cyan/10 text-cyan",
    amber: "border-amber/40 bg-amber/10 text-amber",
    up: "border-up/40 bg-up/10 text-up",
    down: "border-down/40 bg-down/10 text-down",
  };
  return (
    <span className={"inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold " + (tones[tone] || tones.soft)}>
      {children}
    </span>
  );
}

export function Spinner({ label = "Chargement…" }) {
  return (
    <div className="flex items-center gap-3 py-10 text-soft">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-edge border-t-cyan" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, kind, what = "Ces données" }) {
  const text =
    kind === "denied"
      ? "Accès refusé : ce compte n'est pas administrateur."
      : kind === "missing"
        ? what + " nécessitent une migration pas encore appliquée."
        : what + " n'ont pas pu être chargées. Réessaie dans un instant.";
  return <p className="rounded-xl border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-amber">{text}</p>;
}

export function Empty({ children }) {
  return <p className="py-6 text-center text-sm text-soft">{children}</p>;
}

// Tableau simple : colonnes = [{key, label, align, render}].
export function DataTable({ columns, rows, keyOf }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-edge text-left text-xs text-soft">
            {columns.map((c) => (
              <th key={c.key} className={"py-2 pr-3 font-medium " + (c.align === "right" ? "text-right" : "")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={keyOf ? keyOf(r, i) : i} className="border-b border-edge/50 last:border-0">
              {columns.map((c) => (
                <td key={c.key} className={"py-2 pr-3 text-ink " + (c.align === "right" ? "text-right tabular-nums" : "")}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
