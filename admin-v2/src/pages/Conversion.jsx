// Conversion : le tunnel complet de admin_conversion_funnel (0031),
// etape par etape, avec la perte absolue et le plus gros decrochage.
import { Card, Spinner, ErrorBox, Empty, DataTable } from "../components/ui.jsx";
import { fmtInt, fmtPct } from "../lib/format.js";

// Emplacements des boutons « Debloquer » de la page match (0029).
const GATE_LABELS = {
  match_gate_unlock: "Panneau d'analyse (mur Pro)",
  match_avis_unlock: "Avis de l'IA",
  match_recall_unlock: "Rappel après les stats",
  match_analysis_unlock: "Analyse fermée",
  match_faq_unlock: "Réponses de la FAQ",
  match_bar_unlock: "Barre en bas de l'écran",
  home_scorers_unlock: "Buteurs du jour (accueil)",
  home_list_upsell: "Liste des matchs (accueil)",
};

const STEP_LABELS = {
  arrived: "Arrivée sur le site",
  match_page: "Page match ouverte",
  gate_view: "Panneau Pro vu",
  unlock_click: "Clic « Débloquer »",
  pricing_page: "Offre Pro vue",
  consent: "Case CGV cochée",
  checkout: "Paiement lancé",
  subscribed: "Abonné",
};

// steps du RPC -> [{key, label, visitors, reached}] (reached = y compris par
// un autre chemin ; la barre utilise visitors, le chemin strict).
export function funnelStepsOf(funnel) {
  if (!funnel || !Array.isArray(funnel.steps)) return [];
  return funnel.steps.map((s) => ({
    key: s.key,
    label: STEP_LABELS[s.key] || s.key,
    visitors: Number(s.visitors) || 0,
    reached: Number(s.reached) || 0,
  }));
}

export function FunnelSteps({ steps, compact = false }) {
  const first = steps[0]?.visitors || 0;
  let worst = null;
  for (let i = 1; i < steps.length; i++) {
    const lost = steps[i - 1].visitors - steps[i].visitors;
    if (steps[i - 1].visitors > 0 && (!worst || lost > worst.lost)) worst = { i, lost };
  }
  return (
    <ol className="grid gap-2.5">
      {steps.map((s, i) => {
        const pctFirst = first > 0 ? (s.visitors / first) * 100 : 0;
        const prev = i > 0 ? steps[i - 1].visitors : null;
        const pctPrev = prev > 0 ? (s.visitors / prev) * 100 : null;
        const isWorst = worst && worst.i === i && worst.lost > 0;
        return (
          <li key={s.key}>
            {i > 0 && !compact && (
              <p className={"mb-1 text-[11px] " + (isWorst ? "font-semibold text-amber" : "text-soft")}>
                ↓ {pctPrev === null ? "—" : fmtPct(100 - pctPrev)} de perte
                {isWorst ? " · plus gros décrochage" : ""}
              </p>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-medium text-ink">{s.label}</span>
              <span className="text-[13px] font-bold tabular-nums text-ink">
                {fmtInt(s.visitors)}
                <span className="ml-1.5 text-[11px] font-medium text-soft">{i === 0 ? "100 %" : fmtPct(pctFirst, pctFirst < 10 ? 1 : 0)}</span>
                {s.reached > s.visitors && <span className="ml-1.5 text-[11px] font-medium text-soft">({fmtInt(s.reached)} au total)</span>}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className={"h-full rounded-full " + (isWorst ? "bg-amber/70" : "bg-cyan")}
                style={{ width: Math.max(1, Math.min(100, pctFirst)) + "%" }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function Conversion({ dash }) {
  if (dash.loading) return <Spinner label="Calcul du tunnel…" />;
  const f = dash.funnel;
  if (!f) return <ErrorBox {...(dash.funnelError || {})} what="Les données du tunnel" />;
  const steps = funnelStepsOf(f);
  let worst = null;
  for (let i = 1; i < steps.length; i++) {
    const lost = steps[i - 1].visitors - steps[i].visitors;
    if (steps[i - 1].visitors > 0 && (!worst || lost > worst.lost)) worst = { lost, from: steps[i - 1], to: steps[i] };
  }
  const excluded = f.excluded || {};
  const timing = f.signup_timing || {};

  return (
    <div className="grid gap-4">
      <Card
        title="Du visiteur à l'abonné, étape par étape"
        subtitle="Robots, tests, ton appareil et les abonnés déjà Pro sont exclus. Les filtres du haut s'appliquent."
      >
        {steps.length ? <FunnelSteps steps={steps} /> : <Empty>Pas de données sur cette période.</Empty>}
        {worst && worst.lost > 0 && (
          <p className="mt-4 rounded-xl border border-amber/25 bg-amber/5 px-4 py-3 text-sm text-ink">
            C'est ici que tu perds le plus de monde : entre <b>{worst.from.label}</b> et <b>{worst.to.label}</b>,{" "}
            {fmtInt(worst.lost)} personne{worst.lost > 1 ? "s" : ""} sur {fmtInt(worst.from.visitors)} s'arrête
            {worst.lost > 1 ? "nt" : ""} ({fmtPct((worst.lost / worst.from.visitors) * 100)}).
          </p>
        )}
      </Card>

      <Card
        title="Clics « Débloquer » par emplacement"
        subtitle="Quel bouton transforme l'usage en intention de payer. Comptés sur la période, robots exclus."
      >
        {(() => {
          const u = dash.unlocks;
          const rows = (u?.rows || []).map((r) => ({ ...r, label: GATE_LABELS[r.kind] || r.kind }));
          const total = Number(u?.total_clicks) || rows.reduce((s, r) => s + Number(r.clicks || 0), 0);
          if (!rows.length || !total) return <Empty>Aucun clic « Débloquer » sur cette période.</Empty>;
          return (
            <DataTable
              keyOf={(r) => r.kind}
              columns={[
                { key: "label", label: "Emplacement" },
                { key: "clicks", label: "Clics", align: "right", render: (r) => fmtInt(r.clicks) },
                {
                  key: "share",
                  label: "Part",
                  align: "right",
                  render: (r) => (total ? fmtPct((Number(r.clicks) / total) * 100) : "—"),
                },
              ]}
              rows={rows.sort((a, b) => Number(b.clicks) - Number(a.clicks))}
            />
          );
        })()}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Temps avant inscription" subtitle="Pour ceux qui créent un compte pendant leur visite.">
          {Number(timing.signups) > 0 ? (
            <p className="text-sm leading-relaxed text-ink">
              Médiane : <b>{fmtInt(timing.median_sec)} s</b> entre l'arrivée et l'inscription, sur {fmtInt(timing.signups)} inscription
              {Number(timing.signups) > 1 ? "s" : ""}. Pages vues avant de s'inscrire (médiane) : <b>{timing.median_pages ?? "—"}</b>.
            </p>
          ) : (
            <Empty>Aucune inscription sur cette période.</Empty>
          )}
        </Card>
        <Card title="Pages de sortie" subtitle="Dernière page vue par ceux qui ne s'inscrivent pas.">
          {Array.isArray(f.exit_pages) && f.exit_pages.length ? (
            <ul className="grid gap-1.5 text-sm">
              {f.exit_pages.slice(0, 8).map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate text-ink">{e.page}</span>
                  <span className="tabular-nums text-soft">{fmtInt(e.visitors)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Pas de données.</Empty>
          )}
        </Card>
      </div>
    </div>
  );
}
