// Sante : est-ce que tout tourne ? Feux tricolores + les compteurs bruts
// des dernieres 24 h. Memes regles que admin.html, plus l'etat de la
// fonction revenus (Stripe).
import { Card, Spinner, Empty, Badge } from "../components/ui.jsx";
import { buildHealth, ageText } from "../lib/health.js";
import { fmtInt } from "../lib/format.js";

const LEVEL_TONE = { ok: "up", warn: "amber", bad: "down", unknown: "soft" };
const LEVEL_WORD = { ok: "OK", warn: "à surveiller", bad: "problème", unknown: "en cours" };

export default function Health({ dash }) {
  if (dash.loading) return <Spinner label="Vérifications…" />;
  const activePro = dash.business?.subscriptions?.active ?? dash.revenue?.counts?.active ?? null;
  const r = buildHealth({ home: dash.home, health: dash.health, activePro });
  const checks = [...r.checks];
  // Etat de la fonction revenus (Stripe cote lecture).
  checks.push(
    dash.revenue
      ? { key: "revenue", title: "Lecture Stripe (revenus)", level: "ok", text: "La fonction admin-revenue répond normalement." }
      : { key: "revenue", title: "Lecture Stripe (revenus)", level: "warn", text: "La fonction admin-revenue n'a pas répondu : la page Revenus peut être vide." }
  );

  const h = dash.health || {};
  const light = { green: "bg-up", amber: "bg-amber", red: "bg-down", unknown: "bg-soft" }[r.level];

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex items-center gap-3">
          <span className={"h-3.5 w-3.5 rounded-full " + light} aria-hidden="true" />
          <div>
            <p className="text-[15px] font-bold text-ink">{r.title}</p>
            <p className="text-xs text-soft">{r.sentence}</p>
          </div>
        </div>
        <ul className="mt-4 grid gap-2.5">
          {checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2.5 text-sm">
              <Badge tone={LEVEL_TONE[c.level]}>{LEVEL_WORD[c.level]}</Badge>
              <div>
                <p className="font-semibold text-ink">{c.title}</p>
                <p className="text-xs text-soft">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Dernières 24 heures" subtitle="Compteurs bruts du suivi, robots compris.">
        {dash.health ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ["Événements reçus", h.events_24h],
              ["Pages vues", h.page_views_24h],
              ["Marqués robots / interne", h.flagged_events_24h],
            ].map(([label, v]) => (
              <div key={label} className="rounded-xl border border-edge/60 p-3">
                <p className="text-xs text-soft">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-ink">{fmtInt(v)}</p>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Données de santé indisponibles.</Empty>
        )}
        {h.last_signup_at && (
          <p className="mt-3 text-xs text-soft">
            Dernière inscription {ageText((Date.now() - new Date(h.last_signup_at).getTime()) / 3600000)} · dernier message Stripe{" "}
            {h.last_billing_event_at ? ageText((Date.now() - new Date(h.last_billing_event_at).getTime()) / 3600000) : "jamais"}.
          </p>
        )}
      </Card>
    </div>
  );
}
