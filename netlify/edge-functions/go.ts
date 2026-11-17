// /go/<site>/<source> : redirection 302 vers le lien d'affiliation du site de
// paris (09/11/2026). Les adresses sont dans ./lib/go-links.mjs (un seul
// endroit a corriger si le site de paris change de domaine).
// Declaree dans netlify.toml ([[edge_functions]]).
//
// « Pro offert 1 mois » (17/11/2026, migration 0077) : la page Lolly ajoute ?c=<jeton> au lien d'un
// compte connecte. On note ce passage dans la base (pro_offert_clic_marquer) AVANT de rediriger :
// sans lui, la demande de Pro offert est refusee. Jamais bloquant : au pire 1,5 s, puis on redirige.
import { goResponse, jetonClic, evenementClic, MARQUER_URL, SUIVI_URL, CLE_PUBLIQUE } from "./lib/go-links.mjs";

async function noterClic(jeton: string) {
  try {
    await fetch(MARQUER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CLE_PUBLIQUE, Authorization: "Bearer " + CLE_PUBLIQUE },
      body: JSON.stringify({ p_jeton: jeton }),
      signal: AbortSignal.timeout(1500),
    });
  } catch (_e) {
    // La redirection passe avant tout.
  }
}

// Chaque clic compte (17/11/2026) : une ligne dans funnel_events, envoyee sans faire attendre la redirection.
async function compterClic(ev: unknown) {
  try {
    await fetch(SUIVI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CLE_PUBLIQUE, Prefer: "return=minimal" },
      body: JSON.stringify(ev),
      signal: AbortSignal.timeout(1500),
    });
  } catch (_e) {
    // La redirection passe avant tout.
  }
}

export default async (request: Request, context?: { waitUntil?: (p: Promise<unknown>) => void }) => {
  let r;
  try {
    const u = new URL(request.url);
    const ev = evenementClic(u.pathname, request.headers.get("user-agent"));
    if (ev) {
      const p = compterClic(ev);
      if (context && typeof context.waitUntil === "function") context.waitUntil(p);
      else await p;
    }
    const jeton = jetonClic(u.pathname, u.searchParams.get("c"));
    if (jeton) await noterClic(jeton);
    r = goResponse(u.pathname);
  } catch (_e) {
    r = goResponse("/");
  }
  return new Response(null, { status: r.status, headers: r.headers });
};
