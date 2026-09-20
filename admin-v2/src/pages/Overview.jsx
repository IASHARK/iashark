// Vue d'ensemble : en 10 secondes, est-ce que IASHARK va bien ?
// 8 KPI compares a la periode precedente, phrase automatique, bloc
// « A surveiller » (les problemes remontent d'eux-memes), courbe des
// visiteurs, tunnel condense, derniers inscrits.
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card, Kpi, Badge, Spinner, ErrorBox, Empty } from "../components/ui.jsx";
import { fmtInt, fmtPct, fmtMoneyMap, deltaPct, fmtDate } from "../lib/format.js";
import { buildHealth } from "../lib/health.js";
import { useLive } from "../lib/useDashboard.js";
import { FunnelSteps, funnelStepsOf } from "./Conversion.jsx";

// Phrase automatique du jour, honnete : uniquement des faits calcules.
function sentence({ k, prev, business, revenue, leak }) {
  const bits = [];
  bits.push(`${fmtInt(k.visitors)} visiteur${Number(k.visitors) > 1 ? "s" : ""}`);
  const signups = business ? business.accounts_created : k.signups;
  bits.push(Number(signups) > 0 ? `${fmtInt(signups)} inscription${Number(signups) > 1 ? "s" : ""}` : "aucune inscription");
  const newPro = business?.subscriptions?.new_in_period;
  bits.push(Number(newPro) > 0 ? `${fmtInt(newPro)} nouvel abonné Pro` : "aucun nouvel abonné");
  let s = bits.join(", ") + ".";
  const d = deltaPct(k.visitors, prev?.visitors);
  if (d !== null && Math.abs(d) >= 5) s += ` Le trafic est ${d > 0 ? "en hausse" : "en baisse"} de ${fmtPct(Math.abs(d))} vs la période précédente.`;
  if (leak) s += ` La plus grosse perte : ${leak}.`;
  return s;
}

// « A surveiller » : seulement ce qui merite une action, jamais 200 alertes.
function buildAlerts({ business, revenue, home, health, k, prev }) {
  const alerts = [];
  const failed = Number(revenue?.last30d?.failed || 0) + Number(business?.subscriptions?.past_due || 0);
  if (failed > 0) alerts.push({ tone: "amber", text: `${failed} paiement${failed > 1 ? "s" : ""} en échec — à vérifier dans Stripe.` });
  const cancelPending = Number(revenue?.counts?.cancel_at_period_end || 0);
  if (cancelPending > 0) alerts.push({ tone: "amber", text: `${cancelPending} abonné${cancelPending > 1 ? "s ont" : " a"} programmé sa résiliation.` });
  const lights = buildHealth({ home, health, activePro: business?.subscriptions?.active });
  lights.checks.forEach((c) => {
    if (c.level === "bad" || c.level === "warn") alerts.push({ tone: c.level === "bad" ? "down" : "amber", text: c.text || c.title });
  });
  const d = deltaPct(k?.signup_rate, prev?.signup_rate);
  if (d !== null && d < -30) alerts.push({ tone: "amber", text: `Le taux d'inscription chute de ${fmtPct(Math.abs(d))} vs la période précédente.` });
  const dv = deltaPct(k?.visitors, prev?.visitors);
  if (dv !== null && dv > 80 && Number(k.visitors) > 30) alerts.push({ tone: "up", text: `Trafic en forte hausse (+${fmtPct(dv)}) : une publication a pris ?` });
  return alerts;
}

export default function Overview({ dash, onGoTo }) {
  const live = useLive(!dash.denied);
  if (dash.loading) return <Spinner label="Calcul des chiffres…" />;
  const a = dash.analytics;
  if (!a) return <ErrorBox {...(dash.analyticsError || {})} what="Les statistiques" />;
  const k = a.kpis || {};
  const prev = a.previous || {};
  const b = dash.business;
  const rev = dash.revenue;
  const subs = b?.subscriptions || {};
  const steps = funnelStepsOf(dash.funnel);
  let leakText = null;
  if (steps.length > 1) {
    let worst = null;
    for (let i = 1; i < steps.length; i++) {
      const lost = steps[i - 1].visitors - steps[i].visitors;
      if (steps[i - 1].visitors > 0 && (!worst || lost > worst.lost)) worst = { lost, from: steps[i - 1].label, to: steps[i].label };
    }
    if (worst && worst.lost > 0) leakText = `entre « ${worst.from} » et « ${worst.to} » (${fmtInt(worst.lost)} personnes)`;
  }

  const signups = b ? b.accounts_created : k.signups;
  const convInscription = Number(k.visitors) > 0 && Number(signups) >= 0 ? (Number(signups) / Number(k.visitors)) * 100 : null;
  const paid = {};
  (b?.first_payments || []).concat(b?.renewals || []).forEach((p) => {
    const cur = (p.currency || "eur").toUpperCase();
    paid[cur] = (paid[cur] || 0) + Number(p.amount_paid ?? p.amount_total ?? 0) / (p.amount_paid > 500 || p.amount_total > 500 ? 100 : 1);
  });
  const alerts = buildAlerts({ business: b, revenue: rev, home: dash.home, health: dash.health, k, prev });
  const liveCount = live ? Number(live.active_visitors) || 0 : null;

  return (
    <div className="grid gap-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Visiteurs" value={fmtInt(k.visitors)} delta={deltaPct(k.visitors, prev.visitors)} />
        <Kpi label="Inscriptions" value={fmtInt(signups)} delta={b ? deltaPct(b.accounts_created, b.accounts_created_prev) : deltaPct(k.signups, prev.signups)} />
        <Kpi label="Visite → inscription" value={convInscription === null ? "—" : fmtPct(convInscription, 1)} delta={null} />
        <Kpi label="Pro actifs" value={fmtInt(subs.active)} delta={null} hint={Number(subs.new_in_period) > 0 ? `+${fmtInt(subs.new_in_period)} sur la période` : ""} />
        <Kpi label="Nouveaux Pro" value={fmtInt(subs.new_in_period ?? 0)} delta={deltaPct(subs.new_in_period, subs.new_prev_period)} />
        <Kpi label="Paiements lancés" value={fmtInt(k.checkout_started)} delta={deltaPct(k.checkout_started, prev.checkout_started)} />
        <Kpi label="Encaissé (période)" value={fmtMoneyMap(paid)} delta={null} />
        <Kpi label="MRR (Stripe)" value={rev ? fmtMoneyMap(rev.mrr) : "—"} delta={null} hint={rev ? "" : "fonction revenus indisponible"} />
      </div>

      {/* Phrase du jour + en ce moment */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">{sentence({ k, prev, business: b, revenue: rev, leak: leakText })}</p>
          <span className="flex items-center gap-2 rounded-full border border-edge px-3 py-1.5 text-xs text-soft">
            <span className={"h-2 w-2 rounded-full " + (liveCount ? "animate-pulse bg-cyan" : "bg-soft/40")} aria-hidden="true" />
            {liveCount === null ? "en direct…" : liveCount === 0 ? "personne en ce moment" : fmtInt(liveCount) + " sur le site maintenant"}
          </span>
        </div>
      </Card>

      {/* A surveiller */}
      <Card title="À surveiller" subtitle="Seulement ce qui mérite ton attention — rien d'autre.">
        {alerts.length === 0 ? (
          <p className="text-sm text-soft">Rien à signaler : tout tourne normalement.</p>
        ) : (
          <ul className="grid gap-2">
            {alerts.map((al, i) => (
              <li key={i} className="flex items-center gap-2.5 text-sm text-ink">
                <Badge tone={al.tone}>{al.tone === "up" ? "info" : "attention"}</Badge>
                {al.text}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Courbe visiteurs */}
        <Card title="Visiteurs" subtitle="Par jour sur la période, robots et trafic interne exclus.">
          {Array.isArray(a.series) && a.series.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={a.series} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#20d5ef" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#20d5ef" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tickFormatter={fmtDate} stroke="#8da3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#8da3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#0d131c", border: "1px solid rgba(141,179,211,.2)", borderRadius: 10, fontSize: 12 }}
                  labelFormatter={fmtDate}
                  formatter={(v, n) => [fmtInt(v), n === "visitors" ? "visiteurs" : "pages vues"]}
                />
                <Area type="monotone" dataKey="visitors" stroke="#20d5ef" strokeWidth={2} fill="url(#gv)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Empty>Une seule journée sur cette période : passe sur 7 ou 30 jours pour voir la courbe.</Empty>
          )}
        </Card>

        {/* Tunnel condense */}
        <Card title="Du visiteur à l'abonné" subtitle="Le détail complet est dans l'onglet Conversion.">
          {steps.length ? <FunnelSteps steps={steps} compact /> : <Empty>Pas encore de données de tunnel sur cette période.</Empty>}
        </Card>
      </div>

      {/* Jour par jour */}
      {Array.isArray(a.series) && a.series.length > 1 && (
        <Card title="Jour par jour" subtitle="Visiteurs et pages vues, du plus récent au plus ancien.">
          <ul className="grid gap-1.5">
            {[...a.series].reverse().map((d) => (
              <li key={d.t} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink">{fmtDate(d.t)}</span>
                <span className="tabular-nums text-soft">
                  <b className="text-ink">{fmtInt(d.visitors)}</b> visiteur{Number(d.visitors) > 1 ? "s" : ""} · {fmtInt(d.page_views)} pages vues
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Derniers inscrits */}
      <Card title="Derniers inscrits" subtitle="Comptes admin et de test masqués.">
        {Array.isArray(dash.signups) && dash.signups.length ? (
          <ul className="grid gap-1.5">
            {dash.signups.slice(0, 8).map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-ink">{s.email || s.masked_email || "compte"}</span>
                <span className="text-xs text-soft">
                  {[s.created_at ? fmtDate(s.created_at) : null, s.utm_source || s.source || (s.ref ? s.ref : "direct"), s.country_guess || s.country, s.device]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {s.plan === "pro" && <Badge tone="cyan">Pro</Badge>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Aucune inscription récente.</Empty>
        )}
      </Card>
    </div>
  );
}
