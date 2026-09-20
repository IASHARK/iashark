// Visites : les dernieres visites une par une, avec le parcours page par
// page en cliquant (la timeline utilisateur du cahier des charges).
import { useState } from "react";
import { Card, Spinner, ErrorBox, Empty, Badge } from "../components/ui.jsx";
import { fmtInt, fmtTime, fmtDate } from "../lib/format.js";
import { useSessions } from "../lib/useDashboard.js";

function place(s) {
  return [s.geo_city || s.city, s.geo_country || s.country || s.country_guess].filter(Boolean).join(", ") || "lieu inconnu";
}

function deviceLabel(d) {
  return { mobile: "téléphone", desktop: "ordinateur", tablet: "tablette" }[d] || d || "appareil inconnu";
}

function EventLine({ e }) {
  const t = e.at ? fmtTime(e.at) : "";
  if (e.type === "page_view" || e.object === "page_view") {
    return (
      <li className="flex gap-2 text-[13px]">
        <span className="w-12 shrink-0 tabular-nums text-soft">{t}</span>
        <span className="text-ink">{e.label || e.page}</span>
      </li>
    );
  }
  const what =
    e.kind === "checkout"
      ? "Bouton de paiement"
      : e.type === "gate_view"
        ? "Panneau « Débloquer » vu"
        : e.type === "click"
          ? "Clic : " + (e.label || e.kind || "")
          : e.type === "signup_completed"
            ? "Inscription"
            : e.type === "page_leave"
              ? "Quitte la page" + (e.sec ? " (" + fmtInt(e.sec) + " s" + (e.scroll ? ", " + e.scroll + " % lus" : "") + ")" : "")
              : e.label || e.type;
  return (
    <li className="flex gap-2 text-[13px]">
      <span className="w-12 shrink-0 tabular-nums text-soft">{t}</span>
      <span className="text-soft">{what}</span>
    </li>
  );
}

function SessionRow({ s }) {
  const [open, setOpen] = useState(false);
  const dur = Number(s.duration_sec);
  return (
    <li className="rounded-xl border border-edge/60 bg-white/[0.015]">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2.5 text-left">
        <span className="text-xs tabular-nums text-soft">
          {fmtDate(s.first_at || s.at)} {fmtTime(s.first_at || s.at)}
        </span>
        <span className="text-[13px] font-medium text-ink">
          {place(s)} · {deviceLabel(s.device)} · {s.source_group || "direct"}
        </span>
        <span className="ml-auto flex items-center gap-2 text-xs text-soft">
          {fmtInt(s.page_views ?? s.pages)} page{Number(s.page_views ?? s.pages) > 1 ? "s" : ""}
          {Number.isFinite(dur) && dur > 0 && <span>· {dur >= 60 ? Math.round(dur / 60) + " min" : Math.round(dur) + " s"}</span>}
          {s.signed_up && <Badge tone="cyan">inscrit</Badge>}
          {s.checkout_started && !s.checkout_success && <Badge tone="amber">paiement commencé</Badge>}
          {s.checkout_success && <Badge tone="up">abonné</Badge>}
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && (
        <div className="border-t border-edge/60 px-3.5 py-2.5">
          {Array.isArray(s.events) && s.events.length ? (
            <ol className="grid gap-1">
              {s.events.map((e, i) => (
                <EventLine key={i} e={e} />
              ))}
            </ol>
          ) : (
            <p className="text-xs text-soft">
              Arrivé sur {s.entry_page || "?"} · {s.browser || ""} {s.os ? "· " + s.os : ""}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function Visits({ periodId, filters }) {
  const state = useSessions(periodId, filters, true);
  if (state.loading) return <Spinner label="Chargement des visites…" />;
  if (!state.sessions) return <ErrorBox {...(state.error || {})} what="Les visites" />;
  const rows = Array.isArray(state.sessions) ? state.sessions : state.sessions.rows || [];

  return (
    <Card
      title="Dernières visites"
      subtitle="Robots, tests et ton appareil exclus. Clique sur une visite pour voir son parcours page par page."
      right={<span className="text-xs text-soft">{fmtInt(rows.length)} visites</span>}
    >
      {rows.length ? (
        <ul className="grid gap-2">
          {rows.map((s) => (
            <SessionRow key={s.session_id} s={s} />
          ))}
        </ul>
      ) : (
        <Empty>Aucune visite sur cette période avec ces filtres.</Empty>
      )}
    </Card>
  );
}
