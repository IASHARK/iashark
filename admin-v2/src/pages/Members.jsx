// Inscrits : mini-CRM. Segments automatiques dont « forte intention »
// (paywall vu plusieurs fois, clic vers le paiement, checkout commencé sans
// abonnement) : la liste de relance la plus rentable.
import { useMemo, useState } from "react";
import { Card, Spinner, ErrorBox, Empty, DataTable, Badge } from "../components/ui.jsx";
import { fmtInt, fmtDate } from "../lib/format.js";
import { useMembers } from "../lib/useDashboard.js";

function intentScore(m) {
  let score = 0;
  if (Number(m.checkout_started)) score += 3;
  if (Number(m.clicked_pay)) score += 2;
  if (Number(m.paywall_view) >= 2) score += 1;
  if (Number(m.saw_pricing)) score += 1;
  return score;
}

const SEGMENTS = [
  { id: "all", label: "Tous", test: () => true },
  { id: "intent", label: "Forte intention", test: (m) => m.plan !== "pro" && intentScore(m) >= 2 },
  { id: "new", label: "Nouveaux", test: (m) => m.status === "new" },
  { id: "nudge", label: "À relancer", test: (m) => m.status === "to_nudge" },
  { id: "pro", label: "Pro", test: (m) => m.plan === "pro" },
  { id: "gone", label: "Partis", test: (m) => m.status === "gone" },
];

const STATUS_BADGE = {
  new: { label: "Nouveau", tone: "cyan" },
  active: { label: "Actif", tone: "soft" },
  to_nudge: { label: "À relancer", tone: "amber" },
  gone: { label: "Parti", tone: "soft" },
};

export default function Members() {
  const state = useMembers();
  const [segment, setSegment] = useState("all");
  const members = state.members?.members || state.members || [];
  const list = Array.isArray(members) ? members : [];
  const seg = SEGMENTS.find((s) => s.id === segment) || SEGMENTS[0];
  const rows = useMemo(
    () => list.filter(seg.test).sort((x, y) => intentScore(y) - intentScore(x) || String(y.last_seen_at || "").localeCompare(String(x.last_seen_at || ""))),
    [list, segment]
  );

  if (state.loading) return <Spinner label="Chargement des inscrits…" />;
  if (!list.length && state.membersError) return <ErrorBox {...(state.membersError || {})} what="Les inscrits" />;

  const counts = Object.fromEntries(SEGMENTS.map((s) => [s.id, list.filter(s.test).length]));

  return (
    <div className="grid gap-4">
      <Card
        title="Mes inscrits"
        subtitle="Le comportement de chaque compte depuis le 16 septembre. « Forte intention » = a presque payé : ta liste de relance."
        right={<span className="text-xs text-soft">{fmtInt(list.length)} comptes</span>}
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSegment(s.id)}
              className={
                "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition " +
                (segment === s.id ? "bg-cyan/10 text-cyan" : "text-soft hover:text-ink")
              }
            >
              {s.label} <span className="tabular-nums">({counts[s.id]})</span>
            </button>
          ))}
        </div>
        {rows.length ? (
          <DataTable
            keyOf={(m) => m.user_id || m.email_masked}
            columns={[
              {
                key: "email",
                label: "Compte",
                render: (m) => (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{m.email_masked || m.email}</span>
                    {m.plan === "pro" && <Badge tone="cyan">Pro</Badge>}
                    {(() => {
                      const b = STATUS_BADGE[m.status];
                      return b ? <Badge tone={b.tone}>{b.label}</Badge> : null;
                    })()}
                    {m.plan !== "pro" && intentScore(m) >= 2 && <Badge tone="amber">forte intention</Badge>}
                  </span>
                ),
              },
              { key: "created_at", label: "Inscrit", render: (m) => fmtDate(m.created_at) },
              { key: "last_seen_at", label: "Vu", render: (m) => (m.last_seen_at ? fmtDate(m.last_seen_at) : "—") },
              { key: "source_group", label: "Source", render: (m) => m.source_group || "—" },
              { key: "matches_viewed", label: "Matchs", align: "right", render: (m) => fmtInt(m.matches_viewed ?? 0) },
              { key: "paywall_view", label: "Paywall vu", align: "right", render: (m) => fmtInt(m.paywall_view ?? 0) },
              {
                key: "checkout",
                label: "Paiement",
                render: (m) =>
                  Number(m.checkout_started) ? (
                    <Badge tone="amber">commencé, pas fini</Badge>
                  ) : Number(m.clicked_pay) ? (
                    <span className="text-xs text-soft">a cliqué</span>
                  ) : (
                    <span className="text-xs text-soft">—</span>
                  ),
              },
            ]}
            rows={rows}
          />
        ) : (
          <Empty>Aucun compte dans ce segment.</Empty>
        )}
      </Card>

      {segment === "intent" && rows.length > 0 && (
        <Card title="Quoi faire de cette liste">
          <p className="text-sm leading-relaxed text-ink">
            Ces comptes ont presque payé : un email personnel simple (« ton accès est resté en attente, l'hebdo à 6,99 € existe maintenant »)
            convertit mieux que n'importe quelle campagne. Un par un, à la main : à ce volume c'est ton meilleur levier.
          </p>
        </Card>
      )}
    </div>
  );
}
