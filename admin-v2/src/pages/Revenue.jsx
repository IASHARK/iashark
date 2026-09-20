// Revenus : alimente directement par Stripe (fonction Edge admin-revenue),
// jamais reconstruit depuis les pages vues. MRR par devise, etats des
// abonnements, 30 derniers jours (nouveaux vs renouvellements vs echecs),
// derniers mouvements.
import { Card, Kpi, Spinner, ErrorBox, Empty, DataTable, Badge } from "../components/ui.jsx";
import { fmtInt, fmtMoney, fmtMoneyMap, fmtDate } from "../lib/format.js";

const STATUS_LABEL = {
  active: { label: "Actif", tone: "cyan" },
  trialing: { label: "Essai", tone: "cyan" },
  past_due: { label: "Paiement en échec", tone: "amber" },
  canceled: { label: "Résilié", tone: "soft" },
  incomplete: { label: "Incomplet", tone: "soft" },
  incomplete_expired: { label: "Expiré", tone: "soft" },
  unpaid: { label: "Impayé", tone: "amber" },
};
const INTERVAL_LABEL = { week: "hebdo", month: "mensuel", year: "annuel" };
const REASON_LABEL = {
  subscription_create: "Nouvel abonnement",
  subscription_cycle: "Renouvellement",
  subscription_update: "Changement d'offre",
};

export default function Revenue({ dash }) {
  if (dash.loading) return <Spinner label="Lecture de Stripe…" />;
  const r = dash.revenue;
  if (!r) return <ErrorBox {...(dash.revenueError || {})} what="Les chiffres Stripe" />;
  const c = r.counts || {};
  const l30 = r.last30d || {};

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="MRR" value={fmtMoneyMap(r.mrr)} delta={null} hint="mensuel équivalent" />
        <Kpi label="Abonnés actifs" value={fmtInt((c.active || 0) + (c.trialing || 0))} delta={null} />
        <Kpi label="Encaissé · 30 jours" value={fmtMoneyMap(l30.paid_amount)} delta={null} hint={`${fmtInt(l30.paid)} paiement${Number(l30.paid) > 1 ? "s" : ""}`} />
        <Kpi label="Paiements échoués · 30 j" value={fmtInt(l30.failed || 0)} delta={null} goodWhenUp={false} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="D'où vient l'encaissé (30 jours)">
          <ul className="grid gap-2 text-sm">
            <li className="flex justify-between">
              <span className="text-ink">Nouveaux abonnements</span>
              <span className="tabular-nums text-ink">{fmtInt(l30.paid_new || 0)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-ink">Renouvellements</span>
              <span className="tabular-nums text-ink">{fmtInt(l30.paid_renewal || 0)}</span>
            </li>
            <li className="flex justify-between border-t border-edge pt-2">
              <span className="font-semibold text-ink">Total encaissé</span>
              <span className="font-semibold tabular-nums text-ink">{fmtMoneyMap(l30.paid_amount)}</span>
            </li>
          </ul>
          {Number(c.cancel_at_period_end) > 0 && (
            <p className="mt-3 text-xs text-amber">
              {fmtInt(c.cancel_at_period_end)} abonné{Number(c.cancel_at_period_end) > 1 ? "s ont" : " a"} programmé sa résiliation : le MRR baissera à l'échéance.
            </p>
          )}
        </Card>

        <Card title="Abonnements" subtitle="Tous les abonnements Stripe, tous états confondus.">
          {Array.isArray(r.subs) && r.subs.length ? (
            <DataTable
              keyOf={(s, i) => i}
              columns={[
                {
                  key: "status",
                  label: "État",
                  render: (s) => {
                    const st = STATUS_LABEL[s.status] || { label: s.status, tone: "soft" };
                    return <Badge tone={st.tone}>{st.label}</Badge>;
                  },
                },
                { key: "interval", label: "Durée", render: (s) => INTERVAL_LABEL[s.interval] || s.interval },
                { key: "amount", label: "Montant", align: "right", render: (s) => fmtMoney(s.amount, s.currency) },
                { key: "created", label: "Depuis", align: "right", render: (s) => fmtDate(s.created * 1000) },
                {
                  key: "cancel_at_period_end",
                  label: "",
                  render: (s) => (s.cancel_at_period_end ? <Badge tone="amber">résiliation programmée</Badge> : null),
                },
              ]}
              rows={r.subs}
            />
          ) : (
            <Empty>Aucun abonnement pour l'instant.</Empty>
          )}
        </Card>
      </div>

      <Card title="Derniers mouvements" subtitle="Factures Stripe des 30 derniers jours, emails tronqués.">
        {Array.isArray(r.recent) && r.recent.length ? (
          <DataTable
            keyOf={(m, i) => i}
            columns={[
              { key: "created", label: "Date", render: (m) => fmtDate(m.created * 1000) },
              { key: "billing_reason", label: "Type", render: (m) => REASON_LABEL[m.billing_reason] || m.billing_reason || "—" },
              { key: "email", label: "Compte", render: (m) => m.email || "—" },
              { key: "amount", label: "Montant", align: "right", render: (m) => fmtMoney(m.amount, m.currency) },
              {
                key: "status",
                label: "Statut",
                render: (m) =>
                  m.status === "paid" ? <Badge tone="up">payé</Badge> : m.status === "open" ? <Badge tone="amber">en attente</Badge> : <Badge>{m.status}</Badge>,
              },
            ]}
            rows={r.recent}
          />
        ) : (
          <Empty>Aucune facture sur les 30 derniers jours.</Empty>
        )}
      </Card>
    </div>
  );
}
