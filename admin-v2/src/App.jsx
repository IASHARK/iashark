// Admin v2 : coquille de l'application. Garde admin (session Supabase du
// site + role 'admin' dans public.users), navigation laterale, filtres
// globaux (periode, version, appareil, source) appliques a toutes les pages.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { PERIODS, useDashboard } from "./lib/useDashboard.js";
import { Spinner } from "./components/ui.jsx";
import Overview from "./pages/Overview.jsx";
import Acquisition from "./pages/Acquisition.jsx";
import Conversion from "./pages/Conversion.jsx";
import Content from "./pages/Content.jsx";
import Revenue from "./pages/Revenue.jsx";
import Members from "./pages/Members.jsx";
import Visits from "./pages/Visits.jsx";
import Health from "./pages/Health.jsx";

const PAGES = [
  { id: "overview", label: "Vue d'ensemble", icon: "◧" },
  { id: "acquisition", label: "Acquisition", icon: "⇢" },
  { id: "conversion", label: "Conversion", icon: "⌁" },
  { id: "content", label: "Contenu", icon: "⚽" },
  { id: "revenue", label: "Revenus", icon: "◍" },
  { id: "members", label: "Inscrits", icon: "◔" },
  { id: "visits", label: "Visites", icon: "☰" },
  { id: "health", label: "Santé", icon: "♥" },
];

const SITES = [
  { v: "", label: "Toutes les versions" },
  { v: "fr", label: "France (fr)" },
  { v: "gb", label: "Royaume-Uni (gb)" },
  { v: "za", label: "Afrique du Sud (za)" },
  { v: "mx", label: "Mexique (mx)" },
  { v: "en", label: "International (en)" },
];
const DEVICES = [
  { v: "", label: "Tous les appareils" },
  { v: "mobile", label: "Téléphone" },
  { v: "desktop", label: "Ordinateur" },
  { v: "tablet", label: "Tablette" },
];
const SOURCES = [
  { v: "", label: "Toutes les sources" },
  { v: "google", label: "Google" },
  { v: "tiktok", label: "TikTok" },
  { v: "instagram", label: "Instagram" },
  { v: "facebook", label: "Facebook" },
  { v: "x", label: "X / Twitter" },
  { v: "direct", label: "Direct" },
];

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-edge bg-card px-2.5 py-1.5 text-xs text-ink outline-none focus:border-cyan/60"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function LoginGate({ onSession }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err || !data.session) setError("Connexion impossible. Vérifie l'email et le mot de passe.");
    else onSession(data.session);
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-edge bg-card p-6">
        <h1 className="text-lg font-extrabold text-ink">
          IA<span className="text-cyan">SHARK</span> · Admin
        </h1>
        <p className="mt-1 text-xs text-soft">Réservé au propriétaire du site.</p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="mt-4 w-full rounded-lg border border-edge bg-page px-3 py-2 text-sm text-ink outline-none focus:border-cyan/60"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="mt-2 w-full rounded-lg border border-edge bg-page px-3 py-2 text-sm text-ink outline-none focus:border-cyan/60"
        />
        {error && <p className="mt-2 text-xs text-amber">{error}</p>}
        <button
          disabled={busy}
          className="mt-4 w-full rounded-lg bg-cyan px-3 py-2 text-sm font-bold text-page transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = pas encore lu
  const [page, setPage] = useState("overview");
  const [period, setPeriod] = useState("7d");
  const [filters, setFilters] = useState({ site: "", device: "", source: "" });
  const stableFilters = useMemo(() => filters, [filters.site, filters.device, filters.source]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const dash = useDashboard(period, stableFilters, !!session);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page">
        <Spinner label="Ouverture…" />
      </div>
    );
  }
  if (!session) return <LoginGate onSession={setSession} />;
  if (dash.denied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page px-4 text-center">
        <p className="text-sm text-ink">Ce compte n'est pas administrateur.</p>
        <button onClick={() => supabase.auth.signOut()} className="text-xs text-cyan underline underline-offset-2">
          Changer de compte
        </button>
      </div>
    );
  }

  const Page = {
    overview: Overview,
    acquisition: Acquisition,
    conversion: Conversion,
    content: Content,
    revenue: Revenue,
    members: Members,
    visits: Visits,
    health: Health,
  }[page];

  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="mx-auto flex max-w-[1280px]">
        {/* Navigation laterale */}
        <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-edge px-3 py-5 md:flex">
          <p className="px-2 text-base font-extrabold tracking-tight">
            IA<span className="text-cyan">SHARK</span> <span className="text-xs font-semibold text-soft">admin</span>
          </p>
          <nav className="mt-5 flex flex-col gap-1">
            {PAGES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPage(p.id)}
                className={
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-semibold transition " +
                  (page === p.id ? "bg-cyan/10 text-cyan" : "text-soft hover:bg-white/[0.03] hover:text-ink")
                }
              >
                <span aria-hidden="true" className="text-sm">{p.icon}</span>
                {p.label}
              </button>
            ))}
          </nav>
          <div className="mt-auto px-2">
            <a href="/admin.html" className="text-[11px] text-soft underline underline-offset-2 hover:text-ink">
              Ancien tableau de bord
            </a>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 md:px-7">
          {/* Barre du haut : navigation mobile + filtres globaux */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <div className="mr-auto flex gap-1 overflow-x-auto md:hidden">
              {PAGES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPage(p.id)}
                  className={
                    "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold " +
                    (page === p.id ? "bg-cyan/10 text-cyan" : "text-soft")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-edge bg-card p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition " +
                    (period === p.id ? "bg-cyan text-page" : "text-soft hover:text-ink")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Select value={filters.site} onChange={(v) => setFilters((f) => ({ ...f, site: v }))} options={SITES} />
            <Select value={filters.device} onChange={(v) => setFilters((f) => ({ ...f, device: v }))} options={DEVICES} />
            <Select value={filters.source} onChange={(v) => setFilters((f) => ({ ...f, source: v }))} options={SOURCES} />
            <button
              onClick={dash.reload}
              className="rounded-lg border border-edge bg-card px-2.5 py-1.5 text-xs font-semibold text-soft transition hover:text-ink"
            >
              Actualiser
            </button>
          </div>

          <Page dash={dash} periodId={period} filters={stableFilters} />
          <p className="mt-6 text-[11px] text-soft">
            Suivi des visites démarré le 13 septembre 2026 · robots, tests et ton appareil exclus partout · données gardées 13 mois.
          </p>
        </main>
      </div>
    </div>
  );
}
