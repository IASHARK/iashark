// Acquisition : source -> visiteurs -> inscriptions -> paiements. La reponse
// a « qui m'envoie les utilisateurs qui paient ? », pas juste du volume.
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, Spinner, ErrorBox, Empty, DataTable, Badge } from "../components/ui.jsx";
import { fmtInt, fmtPct } from "../lib/format.js";

const SOURCE_LABEL = {
  google: "Google",
  direct: "Direct",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X / Twitter",
  whatsapp: "WhatsApp",
  bing: "Bing",
  social: "Réseaux sociaux",
  referral: "Autres sites",
  other: "Autre",
};

export default function Acquisition({ dash }) {
  if (dash.loading) return <Spinner label="Analyse des sources…" />;
  const a = dash.analytics;
  if (!a) return <ErrorBox {...(dash.analyticsError || {})} what="Les sources" />;
  const sources = (a.sources || []).map((s) => ({
    ...s,
    label: SOURCE_LABEL[s.source_group] || s.source_group || "Inconnue",
    conv: Number(s.visitors) > 0 ? (Number(s.signups) / Number(s.visitors)) * 100 : null,
  }));
  const campaigns = a.campaigns || [];
  const countries = a.countries || [];

  return (
    <div className="grid gap-4">
      <Card
        title="Source → inscription → paiement"
        subtitle="Un visiteur TikTok/Instagram sans UTM apparaît en « Direct » : garde les liens ?utm_source= dans tes bios."
      >
        {sources.length ? (
          <DataTable
            keyOf={(r) => r.source_group}
            columns={[
              { key: "label", label: "Source" },
              { key: "visitors", label: "Visiteurs", align: "right", render: (r) => fmtInt(r.visitors) },
              { key: "signups", label: "Inscrits", align: "right", render: (r) => fmtInt(r.signups) },
              {
                key: "conv",
                label: "Visite → inscription",
                align: "right",
                render: (r) => (r.conv === null ? "—" : fmtPct(r.conv, 1)),
              },
              { key: "checkout_success", label: "Paiements", align: "right", render: (r) => fmtInt(r.checkout_success) },
            ]}
            rows={sources}
          />
        ) : (
          <Empty>Aucune visite sur cette période.</Empty>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Visiteurs par source">
          {sources.length ? (
            <ResponsiveContainer width="100%" height={Math.max(160, sources.length * 36)}>
              <BarChart data={sources} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={110} stroke="#8da3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  contentStyle={{ background: "#0d131c", border: "1px solid rgba(141,179,211,.2)", borderRadius: 10, fontSize: 12 }}
                  formatter={(v) => [fmtInt(v), "visiteurs"]}
                />
                <Bar dataKey="visitors" radius={[0, 6, 6, 0]} barSize={16}>
                  {sources.map((s, i) => (
                    <Cell key={i} fill={i === 0 ? "#20d5ef" : "rgba(32,213,239," + Math.max(0.25, 0.8 - i * 0.12) + ")"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty>Pas de données.</Empty>
          )}
        </Card>

        <Card title="Pays" subtitle="Localisation approximative, jamais l'adresse exacte.">
          {countries.length ? (
            <ul className="grid gap-1.5 text-sm">
              {countries.slice(0, 10).map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-ink">{c.country || "Inconnu"}</span>
                  <span className="tabular-nums text-soft">{fmtInt(c.visitors)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Pas de données.</Empty>
          )}
        </Card>
      </div>

      <Card title="Campagnes (UTM)" subtitle="Chaque lien tagué de tes bios et posts, un par un.">
        {campaigns.length ? (
          <DataTable
            keyOf={(r, i) => i}
            columns={[
              { key: "utm_source", label: "utm_source", render: (r) => r.utm_source || "—" },
              { key: "medium", label: "medium", render: (r) => r.medium || "—" },
              { key: "campaign", label: "campagne", render: (r) => r.campaign || "—" },
              { key: "visitors", label: "Visiteurs", align: "right", render: (r) => fmtInt(r.visitors) },
            ]}
            rows={campaigns.slice(0, 15)}
          />
        ) : (
          <div>
            <Empty>Aucun lien tagué UTM n'a encore amené de visite.</Empty>
            <p className="text-center text-xs text-soft">
              Mets <Badge tone="cyan">iashark.com/?utm_source=tiktok</Badge> dans ta bio TikTok et l'équivalent sur Instagram.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
