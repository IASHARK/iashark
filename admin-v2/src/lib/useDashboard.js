// Chargement des donnees du tableau de bord : memes RPC que admin.html
// (migrations 0019/0022/0025/0031) + la fonction Edge admin-revenue (Stripe).
// Une periode = { from, to } (dates locales AAAA-MM-JJ). La comparaison vs
// periode precedente est calculee par admin_analytics (champ previous).
import { useCallback, useEffect, useState } from "react";
import { rpc, fetchRevenue, LAUNCH_AT } from "./supabase.js";
import { dayStr, addDays } from "./format.js";

export const PERIODS = [
  { id: "today", label: "Aujourd'hui" },
  { id: "yesterday", label: "Hier" },
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
];

export function periodRange(id) {
  const today = dayStr(new Date());
  if (id === "today") return { from: today, to: today, days: 1 };
  if (id === "yesterday") return { from: addDays(today, -1), to: addDays(today, -1), days: 1 };
  if (id === "30d") return { from: addDays(today, -29), to: today, days: 30 };
  return { from: addDays(today, -6), to: today, days: 7 };
}

export function useDashboard(periodId, filters, enabled = true) {
  const [state, setState] = useState({ loading: true });

  const load = useCallback(async () => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true }));
    const r = periodRange(periodId);
    const common = {
      p_include_internal: false,
      p_since: LAUNCH_AT,
      p_site: filters?.site || null,
      p_device: filters?.device || null,
      p_source: filters?.source || null,
    };
    const [analytics, business, funnel, health, revenue, signups, unlocks, home] = await Promise.all([
      rpc("admin_analytics", { p_days: r.days, p_from: r.from, p_to: r.to, ...common }),
      rpc("admin_business", { p_days: r.days, p_from: r.from, p_to: r.to }),
      rpc("admin_conversion_funnel", {
        p_from: r.from,
        p_to: r.to,
        p_include_internal: false,
        p_since: LAUNCH_AT,
        p_country: filters?.country || null,
        p_device: filters?.device || null,
        p_source: filters?.source || null,
      }),
      rpc("admin_health"),
      fetchRevenue(),
      rpc("admin_recent_signups", { p_limit: 60 }),
      rpc("admin_unlock_clicks", { p_from: r.from, p_to: r.to, p_include_internal: false, p_since: LAUNCH_AT }),
      // Pronostics publies : generated_at lu comme le fait admin.html.
      fetch("/data-home.json", { cache: "no-store" })
        .then((res) => (res.ok ? res.json().then((j) => ({ ok: true, generated_at: j.generated_at })) : { ok: false }))
        .catch(() => null),
    ]);
    const denied = [analytics, business, funnel, health].some((x) => x.kind === "denied") || revenue.kind === "denied";
    setState({
      loading: false,
      denied,
      range: r,
      analytics: analytics.data || null,
      analyticsError: analytics.data ? null : analytics,
      business: business.data || null,
      funnel: funnel.data || null,
      funnelError: funnel.data ? null : funnel,
      health: health.data || null,
      revenue: revenue.data || null,
      revenueError: revenue.data ? null : revenue,
      signups: signups.data || null,
      unlocks: unlocks.data || null,
      home,
    });
  }, [periodId, filters?.site, filters?.device, filters?.source, filters?.country, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

// « Qui est la maintenant » : admin_live_view, rafraichi toutes les 30 s
// tant que l'onglet est visible.
export function useLive(enabled = true) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      const r = await rpc("admin_live_view", { p_include_internal: true });
      if (alive && r.data) setLive(r.data);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);
  return live;
}

// Dernieres visites avec leur parcours page par page.
export function useSessions(periodId, filters, enabled = true) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const r = periodRange(periodId);
    setState({ loading: true });
    rpc("admin_recent_sessions", {
      p_limit: 50,
      p_include_internal: false,
      p_from: r.from,
      p_to: r.to,
      p_since: LAUNCH_AT,
      p_site: filters?.site || null,
      p_device: filters?.device || null,
      p_source: filters?.source || null,
    }).then((res) => {
      if (!alive) return;
      setState({ loading: false, sessions: res.data || null, error: res.data ? null : res });
    });
    return () => {
      alive = false;
    };
  }, [periodId, filters?.site, filters?.device, filters?.source, enabled]);
  return state;
}

export function useMembers() {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let alive = true;
    Promise.all([
      rpc("admin_members", { p_days: 30, p_include_internal: false }),
      rpc("admin_retention", { p_include_internal: false }),
    ]).then(([members, retention]) => {
      if (!alive) return;
      setState({
        loading: false,
        denied: members.kind === "denied",
        members: members.data || null,
        membersError: members.data ? null : members,
        retention: retention.data || null,
      });
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
