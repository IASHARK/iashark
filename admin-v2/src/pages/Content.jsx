// Contenu : ce que les visiteurs regardent vraiment. Matchs les plus
// consultes, pages les plus vues, pages d'entree et de sortie, heures de
// presence (jour x heure).
import { Card, Spinner, ErrorBox, Empty, DataTable } from "../components/ui.jsx";
import { fmtInt } from "../lib/format.js";

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function Heatmap({ cells }) {
  // cells: [{dow (0=dimanche cote SQL ou 1..7 ?), hour, t|visitors}] -> grille.
  const byKey = {};
  let max = 0;
  (cells || []).forEach((c) => {
    const v = Number(c.visitors ?? c.t ?? c.page_views ?? 0);
    byKey[c.dow + ":" + c.hour] = v;
    if (v > max) max = v;
  });
  if (!max) return <Empty>Pas encore assez de visites pour la grille des heures.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 0].map((dow, i) => (
            <tr key={dow}>
              <td className="pr-2 text-[10px] text-soft">{DOW[i]}</td>
              {Array.from({ length: 24 }, (_, h) => {
                const v = byKey[dow + ":" + h] || 0;
                return (
                  <td
                    key={h}
                    title={DOW[i] + " " + h + "h : " + fmtInt(v)}
                    className="h-4 w-4 rounded-[3px]"
                    style={{ background: v ? "rgba(32,213,239," + Math.max(0.12, v / max) + ")" : "rgba(255,255,255,0.03)" }}
                  />
                );
              })}
            </tr>
          ))}
          <tr>
            <td />
            {Array.from({ length: 24 }, (_, h) => (
              <td key={h} className="pt-1 text-center text-[9px] text-soft">
                {h % 6 === 0 ? h : ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function matchLink(id) {
  return (
    <a href={"/fr/match.html?id=" + id} target="_blank" rel="noopener" className="text-cyan underline underline-offset-2">
      Match n° {id}
    </a>
  );
}

export default function Content({ dash }) {
  if (dash.loading) return <Spinner label="Analyse du contenu…" />;
  const a = dash.analytics;
  if (!a) return <ErrorBox {...(dash.analyticsError || {})} what="Les données de contenu" />;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Matchs les plus regardés" subtitle="Analyses de match ouvertes sur la période, toutes langues confondues.">
          {Array.isArray(a.top_matches) && a.top_matches.length ? (
            <DataTable
              keyOf={(m) => m.match_id}
              columns={[
                { key: "match_id", label: "Match", render: (m) => (m.label || m.name ? m.label || m.name : matchLink(m.match_id)) },
                { key: "views", label: "Vues", align: "right", render: (m) => fmtInt(m.views) },
                { key: "visitors", label: "Personnes", align: "right", render: (m) => fmtInt(m.visitors ?? m.sessions) },
              ]}
              rows={a.top_matches.slice(0, 12)}
            />
          ) : (
            <Empty>Aucune analyse ouverte sur la période.</Empty>
          )}
        </Card>

        <Card title="Pages les plus vues">
          {Array.isArray(a.top_pages) && a.top_pages.length ? (
            <DataTable
              keyOf={(p) => p.page}
              columns={[
                { key: "page", label: "Page", render: (p) => <span className="break-all">{p.page}</span> },
                { key: "views", label: "Vues", align: "right", render: (p) => fmtInt(p.views) },
              ]}
              rows={a.top_pages.slice(0, 12)}
            />
          ) : (
            <Empty>Pas de données.</Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pages d'entrée" subtitle="Première page vue par les visiteurs.">
          {Array.isArray(a.entry_pages) && a.entry_pages.length ? (
            <ul className="grid gap-1.5 text-sm">
              {a.entry_pages.slice(0, 10).map((p, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate text-ink">{p.page}</span>
                  <span className="tabular-nums text-soft">{fmtInt(p.entries)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Pas de données.</Empty>
          )}
        </Card>
        <Card title="Pages de sortie" subtitle="Dernière page vue avant de quitter le site.">
          {Array.isArray(a.exit_pages) && a.exit_pages.length ? (
            <ul className="grid gap-1.5 text-sm">
              {a.exit_pages.slice(0, 10).map((p, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate text-ink">{p.page}</span>
                  <span className="tabular-nums text-soft">{fmtInt(p.exits)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Pas de données.</Empty>
          )}
        </Card>
      </div>

      <Card title="Quand les gens viennent" subtitle="Visites par jour de la semaine et heure (heure de Paris). Plus c'est cyan, plus il y a de monde.">
        <Heatmap cells={a.heatmap} />
      </Card>
    </div>
  );
}
